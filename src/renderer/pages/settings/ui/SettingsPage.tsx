import { useState, useEffect, useCallback } from 'react'
import { RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent, Separator, Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Badge } from '@shared/ui'
import { useUIStore } from '@app/stores/ui-store'
import { useShortcutStore, formatShortcut } from '@features/keyboard-shortcuts'
import { usePluginStore } from '@entities/plugin'
import { ipcInvoke } from '@shared/lib/ipc'

type SettingsTab = 'general' | 'ai' | 'plugins' | 'connections' | 'shortcuts' | 'about'

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>('general')

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border-subtle)] px-6 py-4">
        <h1 className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">
          Settings
        </h1>
      </div>
      <div className="flex-1 overflow-y-auto">
        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as SettingsTab)}
          className="flex h-full"
        >
          <TabsList className="flex h-full w-48 shrink-0 flex-col items-stretch gap-0.5 rounded-none border-r border-[var(--color-border-subtle)] bg-transparent p-3">
            <SettingsTab value="general">General</SettingsTab>
            <SettingsTab value="ai">AI Models</SettingsTab>
            <SettingsTab value="plugins">Plugins</SettingsTab>
            <SettingsTab value="connections">Connections</SettingsTab>
            <SettingsTab value="shortcuts">Shortcuts</SettingsTab>
            <SettingsTab value="about">About</SettingsTab>
          </TabsList>

          <div className="flex-1 overflow-y-auto p-6">
            <TabsContent value="general" className="mt-0">
              <GeneralSettings />
            </TabsContent>
            <TabsContent value="ai" className="mt-0">
              <AIModelSettings />
            </TabsContent>
            <TabsContent value="plugins" className="mt-0">
              <PluginSettings />
            </TabsContent>
            <TabsContent value="connections" className="mt-0">
              <ConnectionSettings />
            </TabsContent>
            <TabsContent value="shortcuts" className="mt-0">
              <ShortcutSettings />
            </TabsContent>
            <TabsContent value="about" className="mt-0">
              <AboutSettings />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  )
}

function SettingsTab({
  value,
  children
}: {
  value: string
  children: React.ReactNode
}) {
  return (
    <TabsTrigger
      value={value}
      className="justify-start rounded-[var(--radius-md)] px-3 py-1.5 text-[var(--text-sm)] text-[var(--color-text-secondary)] data-[state=active]:bg-[var(--color-bg-hover)] data-[state=active]:text-[var(--color-text-primary)]"
    >
      {children}
    </TabsTrigger>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="mb-4 text-[var(--text-base)] font-semibold text-[var(--color-text-primary)]">
      {children}
    </h2>
  )
}

function SettingRow({
  label,
  description,
  children
}: {
  label: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between py-3">
      <div>
        <Label className="text-[var(--text-sm)] text-[var(--color-text-primary)]">
          {label}
        </Label>
        {description && (
          <p className="mt-0.5 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
            {description}
          </p>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function GeneralSettings() {
  const theme = useUIStore((s) => s.theme)
  const setTheme = useUIStore((s) => s.setTheme)

  return (
    <div className="max-w-lg">
      <SectionTitle>Appearance</SectionTitle>
      <SettingRow label="Theme" description="Choose your preferred color scheme">
        <Select value={theme} onValueChange={(v) => setTheme(v as 'dark' | 'light' | 'system')}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="dark">Dark</SelectItem>
            <SelectItem value="light">Light</SelectItem>
            <SelectItem value="system">System</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
      <Separator className="my-2" />
      <SectionTitle>Sync</SectionTitle>
      <SettingRow
        label="Default sync interval"
        description="How often plugins check for new data"
      >
        <Select defaultValue="300">
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="60">1 minute</SelectItem>
            <SelectItem value="300">5 minutes</SelectItem>
            <SelectItem value="900">15 minutes</SelectItem>
            <SelectItem value="3600">1 hour</SelectItem>
          </SelectContent>
        </Select>
      </SettingRow>
    </div>
  )
}

function AIModelSettings() {
  const [providers, setProviders] = useState<
    Array<{ id: string; name: string; models: string[]; isDefault: boolean }>
  >([])

  useEffect(() => {
    ipcInvoke<typeof providers>('ai:getProviders').then(setProviders).catch(() => {})
  }, [])

  return (
    <div className="max-w-lg">
      <SectionTitle>AI Providers</SectionTitle>
      {providers.length === 0 ? (
        <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          No AI providers configured. Install a provider plugin to get started.
        </p>
      ) : (
        providers.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3 mb-2"
          >
            <div>
              <p className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
                {p.name}
              </p>
              <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
                {p.models.length} model{p.models.length !== 1 ? 's' : ''} available
              </p>
            </div>
            {p.isDefault && (
              <span className="text-[var(--text-xs)] text-[var(--color-accent-primary)]">
                Default
              </span>
            )}
          </div>
        ))
      )}
      <Separator className="my-4" />
      <SectionTitle>Cost Tracking</SectionTitle>
      <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
        View AI usage and costs in the dashboard.
      </p>
    </div>
  )
}

function PluginSettings() {
  const [plugins, setPlugins] = useState<
    Array<{ id: string; name: string; version: string; enabled: number }>
  >([])

  useEffect(() => {
    ipcInvoke<typeof plugins>('plugin:list').then(setPlugins).catch(() => {})
  }, [])

  return (
    <div className="max-w-lg">
      <SectionTitle>Installed Plugins</SectionTitle>
      {plugins.length === 0 ? (
        <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          No plugins installed. Visit the marketplace to install plugins.
        </p>
      ) : (
        plugins.map((p) => (
          <div
            key={p.id}
            className="flex items-center justify-between rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-3 mb-2"
          >
            <div>
              <p className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
                {p.name}
              </p>
              <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
                v{p.version}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const channel = p.enabled ? 'plugin:disable' : 'plugin:enable'
                ipcInvoke(channel, p.id).then(() => {
                  setPlugins((prev) =>
                    prev.map((pl) =>
                      pl.id === p.id
                        ? { ...pl, enabled: pl.enabled ? 0 : 1 }
                        : pl
                    )
                  )
                })
              }}
            >
              {p.enabled ? 'Disable' : 'Enable'}
            </Button>
          </div>
        ))
      )}
    </div>
  )
}

function ConnectionSettings() {
  const plugins = usePluginStore((s) => s.plugins)
  const syncStates = usePluginStore((s) => s.syncStates)
  const loadPlugins = usePluginStore((s) => s.loadPlugins)
  const configurePlugin = usePluginStore((s) => s.configurePlugin)
  const triggerSync = usePluginStore((s) => s.triggerSync)
  const loadSyncState = usePluginStore((s) => s.loadSyncState)

  const [apiKeys, setApiKeys] = useState<Record<string, string>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  const pluginList = Object.values(plugins)

  // Load sync states for all plugins
  useEffect(() => {
    for (const p of pluginList) {
      loadSyncState(p.id)
    }
  }, [pluginList.length, loadSyncState])

  const getPluginSyncStatus = useCallback(
    (pluginId: string): 'connected' | 'syncing' | 'error' | 'not_configured' => {
      const states = Object.entries(syncStates)
        .filter(([key]) => key.startsWith(`${pluginId}:`))
        .map(([, state]) => state)

      if (states.length === 0) return 'not_configured'
      if (states.some((s) => s.syncStatus === 'error')) return 'error'
      if (states.some((s) => s.syncStatus === 'syncing')) return 'syncing'
      if (states.some((s) => s.lastSyncAt)) return 'connected'
      return 'not_configured'
    },
    [syncStates],
  )

  const getLastSyncTime = useCallback(
    (pluginId: string): string | null => {
      const states = Object.entries(syncStates)
        .filter(([key]) => key.startsWith(`${pluginId}:`))
        .map(([, state]) => state)
        .filter((s) => s.lastSyncAt)
        .sort((a, b) => new Date(b.lastSyncAt!).getTime() - new Date(a.lastSyncAt!).getTime())

      if (states.length === 0) return null
      const date = new Date(states[0].lastSyncAt!)
      return date.toLocaleString()
    },
    [syncStates],
  )

  const handleSaveApiKey = async (pluginId: string) => {
    const key = apiKeys[pluginId]
    if (!key?.trim()) return
    setSavingId(pluginId)
    try {
      await configurePlugin(pluginId, { apiKey: key.trim() })
      setApiKeys((prev) => ({ ...prev, [pluginId]: '' }))
      toast.success('API key saved', { description: 'Connection configured securely.' })
    } catch {
      toast.error('Failed to save API key')
    } finally {
      setSavingId(null)
    }
  }

  const handleSync = async (pluginId: string) => {
    setSyncingId(pluginId)
    try {
      await triggerSync(pluginId)
      toast.success('Sync triggered')
    } catch {
      toast.error('Failed to trigger sync')
    } finally {
      setSyncingId(null)
    }
  }

  const statusBadge = (status: ReturnType<typeof getPluginSyncStatus>) => {
    switch (status) {
      case 'connected':
        return <Badge className="bg-[var(--color-success)]/15 text-[var(--color-success)] border-0">Connected</Badge>
      case 'syncing':
        return <Badge className="bg-[var(--color-accent-primary)]/15 text-[var(--color-accent-primary)] border-0">Syncing</Badge>
      case 'error':
        return <Badge className="bg-[var(--color-danger)]/15 text-[var(--color-danger)] border-0">Error</Badge>
      case 'not_configured':
        return <Badge variant="outline" className="text-[var(--color-text-tertiary)]">Not configured</Badge>
    }
  }

  return (
    <div className="max-w-lg">
      <SectionTitle>Service Connections</SectionTitle>
      <p className="mb-4 text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
        Manage API keys and sync status for your installed plugins. Keys are stored securely using system keychain.
      </p>

      {pluginList.length === 0 ? (
        <div className="rounded-[var(--radius-md)] border border-dashed border-[var(--color-border-subtle)] p-6 text-center">
          <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
            No plugins installed. Visit the marketplace to install plugins.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {pluginList.map((plugin) => {
            const status = getPluginSyncStatus(plugin.id)
            const lastSync = getLastSyncTime(plugin.id)
            const isSaving = savingId === plugin.id
            const isSyncing = syncingId === plugin.id

            return (
              <div
                key={plugin.id}
                className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
                        {plugin.name}
                      </p>
                      {statusBadge(status)}
                    </div>
                    <p className="mt-0.5 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
                      v{plugin.version}
                      {lastSync && ` \u00b7 Last synced: ${lastSync}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    disabled={isSyncing || !plugin.enabled}
                    onClick={() => handleSync(plugin.id)}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                  </Button>
                </div>

                {plugin.enabled && (
                  <div className="mt-3 flex gap-2">
                    <Input
                      type="password"
                      placeholder="Enter API key..."
                      value={apiKeys[plugin.id] ?? ''}
                      onChange={(e) =>
                        setApiKeys((prev) => ({ ...prev, [plugin.id]: e.target.value }))
                      }
                      className="h-8 flex-1 text-[var(--text-xs)]"
                    />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!apiKeys[plugin.id]?.trim() || isSaving}
                      onClick={() => handleSaveApiKey(plugin.id)}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </Button>
                  </div>
                )}

                {!plugin.enabled && (
                  <p className="mt-2 text-[var(--text-xs)] text-[var(--color-text-quaternary)]">
                    Enable this plugin in the Plugins tab to configure its connection.
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ShortcutSettings() {
  const shortcuts = useShortcutStore((s) => s.getAll())

  const categories = Array.from(new Set(shortcuts.map((s) => s.category)))

  return (
    <div className="max-w-lg">
      <SectionTitle>Keyboard Shortcuts</SectionTitle>
      {categories.map((cat) => (
        <div key={cat} className="mb-6">
          <h3 className="mb-2 text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">
            {cat}
          </h3>
          {shortcuts
            .filter((s) => s.category === cat)
            .map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-2"
              >
                <span className="text-[var(--text-sm)] text-[var(--color-text-primary)]">
                  {s.label}
                </span>
                <kbd className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-2 py-0.5 text-[var(--text-xs)] text-[var(--color-text-secondary)]">
                  {formatShortcut(s.keys)}
                </kbd>
              </div>
            ))}
        </div>
      ))}
      {shortcuts.length === 0 && (
        <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          No shortcuts registered.
        </p>
      )}
    </div>
  )
}

function AboutSettings() {
  const [version, setVersion] = useState('')

  useEffect(() => {
    ipcInvoke<string>('system:getAppVersion').then(setVersion).catch(() => {})
  }, [])

  return (
    <div className="max-w-lg">
      <SectionTitle>About DevRig</SectionTitle>
      <div className="space-y-3">
        <SettingRow label="Version">
          <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">
            {version || '...'}
          </span>
        </SettingRow>
        <Separator />
        <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          AI-powered developer command center. Unifies all developer tools into
          a single intelligent hub.
        </p>
      </div>
    </div>
  )
}
