import { useState, useEffect } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label, Switch, Input } from '@shared/ui'
import { usePluginStore } from '@entities/plugin'
import type { PluginPreference } from '@entities/plugin'
import { ipcInvoke } from '@shared/lib/ipc'

interface PluginPreferencesPanelProps {
  pluginId: string
}

export function PluginPreferencesPanel({ pluginId }: PluginPreferencesPanelProps) {
  const plugin = usePluginStore((s) => s.plugins[pluginId])
  const preferences = plugin?.preferences ?? []
  const [settings, setSettings] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    ipcInvoke<Record<string, string>>('plugin:getSettings', pluginId)
      .then(setSettings)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [pluginId])

  const updateSetting = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }))
    ipcInvoke('plugin:setSetting', pluginId, key, value).catch(() => {})
  }

  if (loading) {
    return <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">Loading...</p>
  }

  if (preferences.length === 0) {
    return <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">No preferences available for this plugin.</p>
  }

  const getValue = (pref: PluginPreference): string => {
    return settings[pref.id] ?? String(pref.default ?? '')
  }

  return (
    <div className="space-y-3">
      {preferences.map((pref) => {
        switch (pref.type) {
          case 'toggle':
            return (
              <div key={pref.id} className="flex items-center justify-between">
                <div>
                  <Label className="text-[var(--text-xs)] text-[var(--color-text-primary)]">{pref.label}</Label>
                  {pref.description && (
                    <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">{pref.description}</p>
                  )}
                </div>
                <Switch
                  checked={getValue(pref) !== 'false'}
                  onCheckedChange={(checked) => updateSetting(pref.id, String(checked))}
                />
              </div>
            )
          case 'select':
            return (
              <div key={pref.id} className="flex items-center justify-between">
                <div>
                  <Label className="text-[var(--text-xs)] text-[var(--color-text-primary)]">{pref.label}</Label>
                  {pref.description && (
                    <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">{pref.description}</p>
                  )}
                </div>
                <Select value={getValue(pref)} onValueChange={(v) => updateSetting(pref.id, v)}>
                  <SelectTrigger className="w-32 h-7 text-[var(--text-xs)]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(pref.options ?? []).map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )
          case 'text':
            return (
              <div key={pref.id}>
                <Label className="text-[var(--text-xs)] text-[var(--color-text-primary)]">{pref.label}</Label>
                {pref.description && (
                  <p className="mb-1 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">{pref.description}</p>
                )}
                <Input
                  value={getValue(pref)}
                  onChange={(e) => updateSetting(pref.id, e.target.value)}
                  className="h-7 text-[var(--text-xs)]"
                />
              </div>
            )
          case 'number':
            return (
              <div key={pref.id}>
                <Label className="text-[var(--text-xs)] text-[var(--color-text-primary)]">{pref.label}</Label>
                {pref.description && (
                  <p className="mb-1 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">{pref.description}</p>
                )}
                <Input
                  type="number"
                  value={getValue(pref)}
                  onChange={(e) => updateSetting(pref.id, e.target.value)}
                  className="h-7 w-24 text-[var(--text-xs)]"
                />
              </div>
            )
          default:
            return null
        }
      })}
    </div>
  )
}
