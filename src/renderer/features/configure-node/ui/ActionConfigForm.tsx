import { useMemo, useCallback, useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui/select'
import { Label } from '@shared/ui/label'
import { Textarea } from '@shared/ui/textarea'
import { usePluginStore } from '@entities/plugin'

interface ActionConfigFormProps {
  config: string | null
  onChange: (config: string) => void
}

interface ParsedActionConfig {
  actionType: string
  config: Record<string, unknown>
}

type FieldErrors = Record<string, string>

function validateActionConfig(actionType: string, config: Record<string, unknown>): FieldErrors {
  const errors: FieldErrors = {}

  switch (actionType) {
    case 'shell.exec':
      if (!config.command || (config.command as string).trim() === '') {
        errors.command = 'Command is required'
      }
      break
    case 'http.request':
      if (!config.url || (config.url as string).trim() === '') {
        errors.url = 'URL is required'
      }
      break
    case 'file.read':
      if (!config.path || (config.path as string).trim() === '') {
        errors.path = 'File path is required'
      }
      break
    case 'plugin.action':
      if (!config.pluginId || (config.pluginId as string).trim() === '') {
        errors.pluginId = 'Plugin is required'
      }
      if (!config.actionId || (config.actionId as string).trim() === '') {
        errors.actionId = 'Action is required'
      }
      break
  }

  return errors
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return (
    <p className="text-[10px] text-[var(--color-danger)]">{message}</p>
  )
}

export function ActionConfigForm({ config, onChange }: ActionConfigFormProps) {
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const parsed: ParsedActionConfig = useMemo(() => {
    if (!config) return { actionType: 'shell.exec', config: {} }
    try {
      return JSON.parse(config) as ParsedActionConfig
    } catch {
      return { actionType: 'shell.exec', config: {} }
    }
  }, [config])

  const errors = useMemo(
    () => validateActionConfig(parsed.actionType, parsed.config),
    [parsed.actionType, parsed.config],
  )

  const updateConfig = useCallback(
    (actionType: string, actionConfig: Record<string, unknown>) => {
      onChange(JSON.stringify({ actionType, config: actionConfig }))
    },
    [onChange],
  )

  const handleActionTypeChange = (newType: string) => {
    setTouched({})
    const defaults: Record<string, Record<string, unknown>> = {
      'shell.exec': { command: '' },
      'http.request': { method: 'GET', url: '' },
      'file.read': { path: '' },
      'plugin.action': { pluginId: '', actionId: '', params: {} },
    }
    updateConfig(newType, defaults[newType] ?? {})
  }

  const handleFieldChange = (field: string, value: unknown) => {
    updateConfig(parsed.actionType, { ...parsed.config, [field]: value })
  }

  const handleBlur = (field: string) => {
    setTouched((prev) => ({ ...prev, [field]: true }))
  }

  const errorClass = (field: string) =>
    touched[field] && errors[field]
      ? 'border-[var(--color-danger)] focus:ring-[var(--color-danger)]'
      : ''

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
            <SelectItem value="plugin.action">Plugin Action</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {parsed.actionType === 'shell.exec' && (
        <>
          <div className="space-y-1.5">
            <Label>
              Command <span className="text-[var(--color-danger)]">*</span>
            </Label>
            <Textarea
              value={(parsed.config.command as string) ?? ''}
              onChange={(e) => handleFieldChange('command', e.target.value)}
              onBlur={() => handleBlur('command')}
              placeholder="echo Hello World"
              rows={3}
              className={errorClass('command')}
            />
            <FieldError message={touched.command ? errors.command : undefined} />
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
            <Label>
              URL <span className="text-[var(--color-danger)]">*</span>
            </Label>
            <input
              type="text"
              value={(parsed.config.url as string) ?? ''}
              onChange={(e) => handleFieldChange('url', e.target.value)}
              onBlur={() => handleBlur('url')}
              placeholder="https://api.example.com/endpoint"
              className={`flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] ${errorClass('url')}`}
            />
            <FieldError message={touched.url ? errors.url : undefined} />
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
            <Label>
              File Path <span className="text-[var(--color-danger)]">*</span>
            </Label>
            <input
              type="text"
              value={(parsed.config.path as string) ?? ''}
              onChange={(e) => handleFieldChange('path', e.target.value)}
              onBlur={() => handleBlur('path')}
              placeholder="/path/to/file.txt"
              className={`flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)] ${errorClass('path')}`}
            />
            <FieldError message={touched.path ? errors.path : undefined} />
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

      {parsed.actionType === 'plugin.action' && (
        <PluginActionFields
          config={parsed.config}
          onChange={handleFieldChange}
          onBlur={handleBlur}
          errors={errors}
          touched={touched}
          errorClass={errorClass}
        />
      )}
    </div>
  )
}

function PluginActionFields({
  config,
  onChange,
  onBlur,
  errors,
  touched,
  errorClass,
}: {
  config: Record<string, unknown>
  onChange: (field: string, value: unknown) => void
  onBlur: (field: string) => void
  errors: FieldErrors
  touched: Record<string, boolean>
  errorClass: (field: string) => string
}) {
  const plugins = usePluginStore((s) => s.plugins)

  // Only show enabled plugins that have actions
  const actionPlugins = useMemo(
    () =>
      Object.values(plugins).filter(
        (p) => p.enabled && p.capabilities.actions && p.capabilities.actions.length > 0,
      ),
    [plugins],
  )

  const selectedPluginId = (config.pluginId as string) ?? ''
  const selectedPlugin = plugins[selectedPluginId]
  const availableActions = selectedPlugin?.capabilities.actions ?? []

  const handlePluginChange = (pluginId: string) => {
    onChange('pluginId', pluginId)
    onChange('actionId', '')
    onChange('params', {})
  }

  return (
    <>
      <div className="space-y-1.5">
        <Label>
          Plugin <span className="text-[var(--color-danger)]">*</span>
        </Label>
        {actionPlugins.length === 0 ? (
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            No plugins with actions installed. Install a plugin first.
          </p>
        ) : (
          <Select value={selectedPluginId} onValueChange={handlePluginChange}>
            <SelectTrigger className={errorClass('pluginId')}>
              <SelectValue placeholder="Select plugin..." />
            </SelectTrigger>
            <SelectContent>
              {actionPlugins.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <FieldError message={touched.pluginId ? errors.pluginId : undefined} />
      </div>

      {selectedPluginId && (
        <div className="space-y-1.5">
          <Label>
            Action <span className="text-[var(--color-danger)]">*</span>
          </Label>
          {availableActions.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-tertiary)]">
              This plugin has no registered actions.
            </p>
          ) : (
            <Select
              value={(config.actionId as string) ?? ''}
              onValueChange={(v) => onChange('actionId', v)}
            >
              <SelectTrigger className={errorClass('actionId')}>
                <SelectValue placeholder="Select action..." />
              </SelectTrigger>
              <SelectContent>
                {availableActions.map((actionId) => (
                  <SelectItem key={actionId} value={actionId}>
                    {actionId}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <FieldError message={touched.actionId ? errors.actionId : undefined} />
        </div>
      )}

      {selectedPluginId && (config.actionId as string) && (
        <div className="space-y-1.5">
          <Label>Parameters (JSON)</Label>
          <Textarea
            value={
              typeof config.params === 'object' && config.params !== null
                ? JSON.stringify(config.params, null, 2)
                : '{}'
            }
            onChange={(e) => {
              try {
                const parsed = JSON.parse(e.target.value)
                onChange('params', parsed)
              } catch {
                // Allow editing invalid JSON while typing
                onChange('params', e.target.value)
              }
            }}
            onBlur={() => onBlur('params')}
            placeholder='{"key": "value"}'
            rows={4}
          />
          <p className="text-[10px] text-[var(--color-text-tertiary)]">
            Parameters passed to the plugin action. Use template syntax like{' '}
            {'{{nodes.nodeId.output.field}}'} for dynamic values.
          </p>
        </div>
      )}
    </>
  )
}
