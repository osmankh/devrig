import { useState, useEffect } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem, Label, Switch } from '@shared/ui'
import { ipcInvoke } from '@shared/lib/ipc'

interface PluginPreferencesPanelProps {
  pluginId: string
}

export function PluginPreferencesPanel({ pluginId }: PluginPreferencesPanelProps) {
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <Label className="text-[var(--text-xs)] text-[var(--color-text-primary)]">Auto-classify</Label>
          <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
            Automatically classify new items after sync
          </p>
        </div>
        <Switch
          checked={settings.auto_classify !== 'false'}
          onCheckedChange={(checked) => updateSetting('auto_classify', String(checked))}
        />
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-[var(--text-xs)] text-[var(--color-text-primary)]">Sync interval</Label>
        <Select
          value={settings.sync_interval_ms ?? '300000'}
          onValueChange={(v) => updateSetting('sync_interval_ms', v)}
        >
          <SelectTrigger className="w-28 h-7 text-[var(--text-xs)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="60000">1 min</SelectItem>
            <SelectItem value="300000">5 min</SelectItem>
            <SelectItem value="900000">15 min</SelectItem>
            <SelectItem value="3600000">1 hour</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label className="text-[var(--text-xs)] text-[var(--color-text-primary)]">Draft tone</Label>
        <Select
          value={settings.draft_tone ?? 'professional'}
          onValueChange={(v) => updateSetting('draft_tone', v)}
        >
          <SelectTrigger className="w-28 h-7 text-[var(--text-xs)]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="casual">Casual</SelectItem>
            <SelectItem value="concise">Concise</SelectItem>
            <SelectItem value="detailed">Detailed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <Label className="text-[var(--text-xs)] text-[var(--color-text-primary)]">Auto-archive noise</Label>
          <p className="text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
            Automatically archive items classified as noise
          </p>
        </div>
        <Switch
          checked={settings.auto_archive_noise === 'true'}
          onCheckedChange={(checked) => updateSetting('auto_archive_noise', String(checked))}
        />
      </div>
    </div>
  )
}
