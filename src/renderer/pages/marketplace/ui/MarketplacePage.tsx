import { useCallback, useEffect, useState } from 'react'
import { usePluginStore, type Plugin } from '@entities/plugin'
import { Badge, Button } from '@shared/ui'
import { Download, Power } from 'lucide-react'
import { toast } from 'sonner'
import { ipcInvoke } from '@shared/lib/ipc'

function PluginCard({ plugin }: { plugin: Plugin }) {
  const enablePlugin = usePluginStore((s) => s.enablePlugin)
  const disablePlugin = usePluginStore((s) => s.disablePlugin)

  return (
    <div className="flex items-start gap-3 rounded-lg border border-border p-4">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
        {plugin.icon ?? plugin.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-foreground">{plugin.name}</span>
          <Badge variant="outline" className="text-[10px]">v{plugin.version}</Badge>
          {plugin.enabled && (
            <Badge variant="default" className="text-[10px]">Active</Badge>
          )}
        </div>
        {plugin.description && (
          <p className="mt-1 text-xs text-muted-foreground">{plugin.description}</p>
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
  const installPlugin = usePluginStore((s) => s.installPlugin)
  const [installing, setInstalling] = useState(false)

  const handleInstallFromFile = useCallback(async () => {
    try {
      const result = await ipcInvoke<{ canceled: boolean; filePaths: string[] }>(
        'system:showOpenDialog',
        { title: 'Select plugin directory', properties: ['openDirectory'] }
      )
      if (result.canceled || result.filePaths.length === 0) return
      setInstalling(true)
      await installPlugin(result.filePaths[0])
      toast.success('Plugin installed successfully')
    } catch (err) {
      toast.error(`Failed to install plugin: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInstalling(false)
    }
  }, [installPlugin])

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  const pluginList = Object.values(plugins)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-3">
        <h1 className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">
          Plugin Marketplace
        </h1>
        <Button
          variant="outline"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          disabled={installing}
          onClick={handleInstallFromFile}
        >
          <Download className="h-3.5 w-3.5" />
          {installing ? 'Installing...' : 'Install from file'}
        </Button>
      </div>
      <div className="flex-1 overflow-auto px-6 py-4">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading plugins...</p>
        ) : pluginList.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">No plugins installed</p>
            <p className="mt-1 text-xs">Install plugins to connect your tools</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {pluginList.map((plugin) => (
              <PluginCard key={plugin.id} plugin={plugin} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
