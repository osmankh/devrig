import { useState, useEffect } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent, Separator, Button, Input, Label, Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui'
import { useUIStore } from '@app/stores/ui-store'
import { useShortcutStore, formatShortcut } from '@features/keyboard-shortcuts'
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
  return (
    <div className="max-w-lg">
      <SectionTitle>Service Connections</SectionTitle>
      <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
        Manage OAuth connections and API keys for your plugins. Each plugin
        manages its own authentication through its settings.
      </p>
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
