import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, Check } from 'lucide-react'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger, TabsContent, Separator, Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Badge, Switch } from '@shared/ui'
import { useUIStore } from '@app/stores/ui-store'
import { useShortcutStore, formatShortcut } from '@features/keyboard-shortcuts'
import { PluginPreferencesPanel } from '@features/plugin-preferences'
import { OAuthConnectButton } from '@features/plugin-onboarding/ui/OAuthConnectButton'
import { oauthStatus, oauthDisconnect, oauthSupports } from '@features/plugin-onboarding/lib/oauth-ipc'
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
            <SettingsTabTrigger value="general">General</SettingsTabTrigger>
            <SettingsTabTrigger value="ai">AI Models</SettingsTabTrigger>
            <SettingsTabTrigger value="plugins">Plugins</SettingsTabTrigger>
            <SettingsTabTrigger value="connections">Connections</SettingsTabTrigger>
            <SettingsTabTrigger value="shortcuts">Shortcuts</SettingsTabTrigger>
            <SettingsTabTrigger value="about">About</SettingsTabTrigger>
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

function SettingsTabTrigger({
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
  const [apiKey, setApiKey] = useState('')
  const [hasKey, setHasKey] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    ipcInvoke<typeof providers>('ai:getProviders').then(setProviders).catch(() => {})
    ipcInvoke<boolean>('ai:hasApiKey', 'claude').then(setHasKey).catch(() => {})
  }, [])

  const handleSaveKey = async () => {
    if (!apiKey.trim()) return
    setSaving(true)
    try {
      await ipcInvoke('ai:setApiKey', 'claude', apiKey.trim())
      setHasKey(true)
      setApiKey('')
      toast.success('API key saved')
    } catch {
      toast.error('Failed to save API key')
    } finally {
      setSaving(false)
    }
  }

  const handleTestConnection = async () => {
    setTesting(true)
    try {
      const result = await ipcInvoke<{ success: boolean; error?: string }>('ai:testConnection', 'claude')
      if (result.success) {
        toast.success('Connection successful', { description: 'Claude API is working correctly.' })
      } else {
        toast.error('Connection failed', { description: result.error ?? 'Unknown error' })
      }
    } catch {
      toast.error('Connection test failed')
    } finally {
      setTesting(false)
    }
  }

  return (
    <div className="max-w-lg">
      <SectionTitle>Claude API Key</SectionTitle>
      <div className="rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-4 mb-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <p className="text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
              Anthropic Claude
            </p>
            <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
              Powers classification, summarization, and drafting
            </p>
          </div>
          {hasKey ? (
            <Badge className="bg-[var(--color-success)]/15 text-[var(--color-success)] border-0">
              Configured
            </Badge>
          ) : (
            <Badge className="bg-[var(--color-danger)]/15 text-[var(--color-danger)] border-0">
              Not configured
            </Badge>
          )}
        </div>
        <div className="flex gap-2">
          <Input
            type="password"
            placeholder={hasKey ? 'Enter new key to replace...' : 'sk-ant-...'}
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="h-8 flex-1 text-[var(--text-xs)]"
          />
          <Button
            size="sm"
            variant="outline"
            disabled={!apiKey.trim() || saving}
            onClick={handleSaveKey}
          >
            {saving ? 'Saving...' : 'Save'}
          </Button>
        </div>
        {hasKey && (
          <Button
            size="sm"
            variant="ghost"
            className="mt-2 text-[var(--text-xs)]"
            disabled={testing}
            onClick={handleTestConnection}
          >
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
        )}
      </div>

      <SectionTitle>AI Providers</SectionTitle>
      {providers.length === 0 ? (
        <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          No AI providers configured. Add your Claude API key above to get started.
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
  const triggerSync = usePluginStore((s) => s.triggerSync)
  const loadSyncState = usePluginStore((s) => s.loadSyncState)

  const [secretValues, setSecretValues] = useState<Record<string, string>>({})
  const [secretStatus, setSecretStatus] = useState<Record<string, boolean>>({})
  const [savingKey, setSavingKey] = useState<string | null>(null)
  const [syncingId, setSyncingId] = useState<string | null>(null)
  const [expandedPrefs, setExpandedPrefs] = useState<string | null>(null)
  const [oauthStatuses, setOauthStatuses] = useState<Record<string, { connected: boolean; supportsOAuth: boolean }>>({})

  useEffect(() => {
    loadPlugins()
  }, [loadPlugins])

  const pluginList = Object.values(plugins)

  // Load sync states, secret status, and OAuth status for all plugins
  useEffect(() => {
    for (const p of pluginList) {
      loadSyncState(p.id)
      if (p.requiredSecrets) {
        for (const key of p.requiredSecrets) {
          ipcInvoke<boolean>('plugin:hasSecret', p.id, key)
            .then((has) => setSecretStatus((prev) => ({ ...prev, [`${p.id}:${key}`]: has })))
            .catch(() => {})
        }
      }
      // Check OAuth support and status
      Promise.all([
        oauthSupports(p.id).catch(() => false),
        oauthStatus(p.id).catch(() => ({ connected: false })),
      ]).then(([supports, status]) => {
        setOauthStatuses((prev) => ({
          ...prev,
          [p.id]: { supportsOAuth: supports, connected: status.connected },
        }))
      })
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
      return new Date(states[0].lastSyncAt!).toLocaleString()
    },
    [syncStates],
  )

  const humanizeSecretKey = (key: string): string => {
    const map: Record<string, string> = {
      gmail_oauth_token: 'Gmail OAuth Token',
      github_token: 'GitHub Personal Access Token',
      linear_api_key: 'Linear API Key',
      apiKey: 'API Key',
    }
    if (map[key]) return map[key]
    return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
  }

  const handleSaveSecret = async (pluginId: string, secretKey: string) => {
    const compositeKey = `${pluginId}:${secretKey}`
    const value = secretValues[compositeKey]
    if (!value?.trim()) return
    setSavingKey(compositeKey)
    try {
      await ipcInvoke('plugin:setSecret', pluginId, secretKey, value.trim())
      setSecretStatus((prev) => ({ ...prev, [compositeKey]: true }))
      setSecretValues((prev) => ({ ...prev, [compositeKey]: '' }))
      toast.success('Credential saved', { description: `${humanizeSecretKey(secretKey)} stored securely.` })
    } catch {
      toast.error('Failed to save credential')
    } finally {
      setSavingKey(null)
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
        Manage credentials and sync status for your installed plugins. Secrets are stored securely using system keychain.
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
            const isSyncing = syncingId === plugin.id
            const secrets = plugin.requiredSecrets ?? []

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

                {/* OAuth section */}
                {plugin.enabled && plugin.authType === 'oauth' && oauthStatuses[plugin.id]?.supportsOAuth && (
                  <div className="mt-3">
                    {oauthStatuses[plugin.id]?.connected ? (
                      <div className="flex items-center justify-between">
                        <Badge className="bg-[var(--color-success)]/15 text-[var(--color-success)] border-0">
                          Connected via OAuth
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-[var(--text-xs)] text-[var(--color-danger)]"
                          onClick={async () => {
                            try {
                              await oauthDisconnect(plugin.id)
                              setOauthStatuses((prev) => ({
                                ...prev,
                                [plugin.id]: { ...prev[plugin.id], connected: false },
                              }))
                              toast.success('Disconnected')
                            } catch {
                              toast.error('Failed to disconnect')
                            }
                          }}
                        >
                          Disconnect
                        </Button>
                      </div>
                    ) : (
                      <OAuthConnectButton
                        pluginId={plugin.id}
                        pluginName={plugin.name}
                        onConnected={() => {
                          setOauthStatuses((prev) => ({
                            ...prev,
                            [plugin.id]: { ...prev[plugin.id], connected: true },
                          }))
                        }}
                      />
                    )}
                  </div>
                )}

                {plugin.enabled && plugin.authType === 'oauth' && !oauthStatuses[plugin.id]?.supportsOAuth && (
                  <p className="mt-2 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
                    OAuth not configured — set environment variables.
                  </p>
                )}

                {/* Manual secrets (for api_key or fallback) */}
                {plugin.enabled && plugin.authType !== 'oauth' && secrets.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {secrets.map((secretKey) => {
                      const compositeKey = `${plugin.id}:${secretKey}`
                      const isConfigured = secretStatus[compositeKey] ?? false
                      const isSaving = savingKey === compositeKey
                      return (
                        <div key={secretKey}>
                          <div className="flex items-center gap-2 mb-1">
                            <Label className="text-[var(--text-xs)] text-[var(--color-text-secondary)]">
                              {humanizeSecretKey(secretKey)}
                            </Label>
                            {isConfigured ? (
                              <Badge className="bg-[var(--color-success)]/15 text-[var(--color-success)] border-0 text-[10px] px-1.5 py-0">
                                Saved
                              </Badge>
                            ) : (
                              <Badge className="bg-[var(--color-warning)]/15 text-[var(--color-warning)] border-0 text-[10px] px-1.5 py-0">
                                Required
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-2">
                            <Input
                              type="password"
                              placeholder={isConfigured ? 'Enter new value to replace...' : `Enter ${humanizeSecretKey(secretKey).toLowerCase()}...`}
                              value={secretValues[compositeKey] ?? ''}
                              onChange={(e) =>
                                setSecretValues((prev) => ({ ...prev, [compositeKey]: e.target.value }))
                              }
                              className="h-8 flex-1 text-[var(--text-xs)]"
                            />
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={!secretValues[compositeKey]?.trim() || isSaving}
                              onClick={() => handleSaveSecret(plugin.id, secretKey)}
                            >
                              {isSaving ? 'Saving...' : 'Save'}
                            </Button>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}

                {plugin.enabled && plugin.authType !== 'oauth' && secrets.length === 0 && (
                  <p className="mt-2 text-[var(--text-xs)] text-[var(--color-text-quaternary)]">
                    This plugin doesn't require any credentials.
                  </p>
                )}

                {!plugin.enabled && (
                  <p className="mt-2 text-[var(--text-xs)] text-[var(--color-text-quaternary)]">
                    Enable this plugin in the Plugins tab to configure its connection.
                  </p>
                )}

                {/* Preferences toggle */}
                {plugin.enabled && (
                  <div className="mt-3 border-t border-[var(--color-border-subtle)] pt-3">
                    <button
                      className="text-[var(--text-xs)] text-[var(--color-accent-primary)] hover:underline"
                      onClick={() => setExpandedPrefs(expandedPrefs === plugin.id ? null : plugin.id)}
                    >
                      {expandedPrefs === plugin.id ? 'Hide Preferences' : 'Preferences'}
                    </button>
                    {expandedPrefs === plugin.id && (
                      <div className="mt-2">
                        <PluginPreferencesPanel pluginId={plugin.id} />
                      </div>
                    )}
                  </div>
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
  const shortcutMap = useShortcutStore((s) => s.shortcuts)
  const shortcuts = Array.from(shortcutMap.values())

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
