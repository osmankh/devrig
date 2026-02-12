import { useMemo, useCallback } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui/select'
import { Label } from '@shared/ui/label'

interface TriggerConfigFormProps {
  config: string | null
  onChange: (config: string) => void
}

interface ParsedTriggerConfig {
  triggerType: string
  schedule?: {
    intervalValue: number
    intervalUnit: 'minutes' | 'hours' | 'days'
  }
}

export function TriggerConfigForm({ config, onChange }: TriggerConfigFormProps) {
  const parsed: ParsedTriggerConfig = useMemo(() => {
    if (!config) return { triggerType: 'manual' }
    try {
      return JSON.parse(config) as ParsedTriggerConfig
    } catch {
      return { triggerType: 'manual' }
    }
  }, [config])

  const updateConfig = useCallback(
    (updates: Partial<ParsedTriggerConfig>) => {
      onChange(JSON.stringify({ ...parsed, ...updates }))
    },
    [onChange, parsed],
  )

  const handleTriggerTypeChange = (newType: string) => {
    if (newType === 'schedule') {
      updateConfig({
        triggerType: 'schedule',
        schedule: parsed.schedule ?? { intervalValue: 15, intervalUnit: 'minutes' },
      })
    } else {
      const { schedule: _s, ...rest } = parsed
      onChange(JSON.stringify({ ...rest, triggerType: 'manual' }))
    }
  }

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Trigger Type</Label>
        <Select value={parsed.triggerType} onValueChange={handleTriggerTypeChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="manual">Manual</SelectItem>
            <SelectItem value="schedule">Scheduled</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {parsed.triggerType === 'manual' && (
        <p className="text-[11px] text-[var(--color-text-tertiary)]">
          This workflow will be started manually via the Run button.
        </p>
      )}

      {parsed.triggerType === 'schedule' && (
        <>
          <p className="text-[11px] text-[var(--color-text-tertiary)]">
            This workflow will run automatically on the configured interval.
          </p>
          <div className="flex items-end gap-2">
            <div className="flex-1 space-y-1.5">
              <Label>Every</Label>
              <input
                type="number"
                min={1}
                value={parsed.schedule?.intervalValue ?? 15}
                onChange={(e) =>
                  updateConfig({
                    schedule: {
                      intervalValue: Math.max(1, parseInt(e.target.value) || 1),
                      intervalUnit: parsed.schedule?.intervalUnit ?? 'minutes',
                    },
                  })
                }
                className="flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
              />
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>Unit</Label>
              <Select
                value={parsed.schedule?.intervalUnit ?? 'minutes'}
                onValueChange={(unit) =>
                  updateConfig({
                    schedule: {
                      intervalValue: parsed.schedule?.intervalValue ?? 15,
                      intervalUnit: unit as 'minutes' | 'hours' | 'days',
                    },
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="minutes">Minutes</SelectItem>
                  <SelectItem value="hours">Hours</SelectItem>
                  <SelectItem value="days">Days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
