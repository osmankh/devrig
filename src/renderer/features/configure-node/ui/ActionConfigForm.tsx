import { useMemo, useCallback } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui/select'
import { Label } from '@shared/ui/label'
import { Textarea } from '@shared/ui/textarea'

interface ActionConfigFormProps {
  config: string | null
  onChange: (config: string) => void
}

interface ParsedActionConfig {
  actionType: string
  config: Record<string, unknown>
}

export function ActionConfigForm({ config, onChange }: ActionConfigFormProps) {
  const parsed: ParsedActionConfig = useMemo(() => {
    if (!config) return { actionType: 'shell.exec', config: {} }
    try {
      return JSON.parse(config) as ParsedActionConfig
    } catch {
      return { actionType: 'shell.exec', config: {} }
    }
  }, [config])

  const updateConfig = useCallback(
    (actionType: string, actionConfig: Record<string, unknown>) => {
      onChange(JSON.stringify({ actionType, config: actionConfig }))
    },
    [onChange],
  )

  const handleActionTypeChange = (newType: string) => {
    const defaults: Record<string, Record<string, unknown>> = {
      'shell.exec': { command: '' },
      'http.request': { method: 'GET', url: '' },
      'file.read': { path: '' },
    }
    updateConfig(newType, defaults[newType] ?? {})
  }

  const handleFieldChange = (field: string, value: unknown) => {
    updateConfig(parsed.actionType, { ...parsed.config, [field]: value })
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Action Type</Label>
        <Select value={parsed.actionType} onValueChange={handleActionTypeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="shell.exec">Shell Command</SelectItem>
            <SelectItem value="http.request">HTTP Request</SelectItem>
            <SelectItem value="file.read">Read File</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {parsed.actionType === 'shell.exec' && (
        <>
          <div className="space-y-1.5">
            <Label>Command</Label>
            <Textarea
              value={(parsed.config.command as string) ?? ''}
              onChange={(e) => handleFieldChange('command', e.target.value)}
              placeholder="echo Hello World"
              rows={3}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Working Directory</Label>
            <input
              type="text"
              value={(parsed.config.workingDirectory as string) ?? ''}
              onChange={(e) => handleFieldChange('workingDirectory', e.target.value)}
              placeholder="/path/to/directory"
              className="flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Timeout (ms)</Label>
            <input
              type="number"
              value={(parsed.config.timeout as number) ?? 30000}
              onChange={(e) => handleFieldChange('timeout', parseInt(e.target.value) || 30000)}
              className="flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            />
          </div>
        </>
      )}

      {parsed.actionType === 'http.request' && (
        <>
          <div className="space-y-1.5">
            <Label>Method</Label>
            <Select
              value={(parsed.config.method as string) ?? 'GET'}
              onValueChange={(v) => handleFieldChange('method', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="GET">GET</SelectItem>
                <SelectItem value="POST">POST</SelectItem>
                <SelectItem value="PUT">PUT</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
                <SelectItem value="PATCH">PATCH</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>URL</Label>
            <input
              type="text"
              value={(parsed.config.url as string) ?? ''}
              onChange={(e) => handleFieldChange('url', e.target.value)}
              placeholder="https://api.example.com/endpoint"
              className="flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Body</Label>
            <Textarea
              value={(parsed.config.body as string) ?? ''}
              onChange={(e) => handleFieldChange('body', e.target.value)}
              placeholder='{"key": "value"}'
              rows={4}
            />
          </div>
        </>
      )}

      {parsed.actionType === 'file.read' && (
        <>
          <div className="space-y-1.5">
            <Label>File Path</Label>
            <input
              type="text"
              value={(parsed.config.path as string) ?? ''}
              onChange={(e) => handleFieldChange('path', e.target.value)}
              placeholder="/path/to/file.txt"
              className="flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Encoding</Label>
            <Select
              value={(parsed.config.encoding as string) ?? 'utf-8'}
              onValueChange={(v) => handleFieldChange('encoding', v)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utf-8">UTF-8</SelectItem>
                <SelectItem value="ascii">ASCII</SelectItem>
                <SelectItem value="base64">Base64</SelectItem>
                <SelectItem value="hex">Hex</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
    </div>
  )
}
