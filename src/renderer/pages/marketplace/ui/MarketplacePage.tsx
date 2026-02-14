import { useEffect, useState } from 'react'
import { usePluginStore, type Plugin } from '@entities/plugin'
import { Badge, Button } from '@shared/ui'
import { Plus, Power, Puzzle } from 'lucide-react'
import { PluginHubDialog } from '@widgets/plugin-hub'

const PLUGIN_EMOJI: Record<string, string> = {
  gmail: '\u2709\ufe0f',
  github: '\ud83d\udc19',
  linear: '\ud83d\udcca',
}

function InstalledPluginCard({ plugin }: { plugin: Plugin }) {
  const enablePlugin = usePluginStore((s) => s.enablePlugin)
  const disablePlugin = usePluginStore((s) => s.disablePlugin)

  const emoji = PLUGIN_EMOJI[plugin.id]

  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border-subtle)] p-4 transition-colors hover:border-[var(--color-border-default)]">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[var(--color-bg-hover)] text-lg">
        {emoji ?? plugin.icon ?? plugin.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
            {plugin.name}
          </span>
          <Badge variant="outline" className="text-[10px]">v{plugin.version}</Badge>
          {plugin.enabled ? (
            <Badge className="border-0 bg-[var(--color-success)]/15 text-[var(--color-success)] text-[10px]">
              Active
            </Badge>
          ) : (
            <Badge variant="outline" className="text-[10px] text-[var(--color-text-tertiary)]">
              Disabled
            </Badge>
          )}
        </div>
        {plugin.description && (
          <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
            {plugin.description}
          </p>
        )}
        {plugin.capabilities.dataSources && plugin.capabilities.dataSources.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1">
            {plugin.capabilities.dataSources.map((ds) => (
              <Badge key={ds} variant="secondary" className="text-[10px]">{ds}</Badge>
            ))}
          </div>
        )}
      </div>
      <Button
        variant={plugin.enabled ? 'outline' : 'default'}
        size="sm"
        className="h-7 gap-1 text-xs"
        onClick={() =>
          plugin.enabled ? disablePlugin(plugin.id) : enablePlugin(plugin.id)
        }
      >
        <Power className="h-3 w-3" />
        {plugin.enabled ? 'Disable' : 'Enable'}
      </Button>
    </div>
  )
}

export function MarketplacePage() {
  const plugins = usePluginStore((s) => s.plugins)
  const isLoading = usePluginStore((s) => s.isLoading)
  const loadPlugins = usePluginStore((s) => s.loadPlugins)
  const [hubOpen, setHubOpen] = useState(false)

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  const pluginList = Object.values(plugins)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-3">
        <div className="flex items-center gap-2.5">
          <Puzzle className="h-5 w-5 text-[var(--color-accent-primary)]" />
          <h1 className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">
            Plugins
          </h1>
        </div>
        <Button
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={() => setHubOpen(true)}
        >
          <Plus className="h-3.5 w-3.5" />
          Add Plugin
        </Button>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
            Loading plugins...
          </p>
        ) : pluginList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-bg-hover)]">
              <Puzzle className="h-8 w-8 text-[var(--color-text-quaternary)]" />
            </div>
            <p className="mt-4 text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">
              No plugins installed
            </p>
            <p className="mt-1 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
              Add plugins to connect your developer tools
            </p>
            <Button
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => setHubOpen(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Browse Plugins
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pluginList.map((plugin) => (
              <InstalledPluginCard key={plugin.id} plugin={plugin} />
            ))}
          </div>
        )}
      </div>

      <PluginHubDialog open={hubOpen} onOpenChange={setHubOpen} />
    </div>
  )
}
