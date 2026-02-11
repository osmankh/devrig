import { useMemo, useCallback } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui/select'
import { Label } from '@shared/ui/label'

interface ConditionConfigFormProps {
  config: string | null
  onChange: (config: string) => void
}

interface ParsedConditionConfig {
  condition: {
    type: 'compare'
    left: { type: string; value?: string | number | boolean; nodeId?: string; path?: string }
    operator: string
    right: { type: string; value?: string | number | boolean; nodeId?: string; path?: string }
  }
}

const defaultCondition: ParsedConditionConfig = {
  condition: {
    type: 'compare',
    left: { type: 'literal', value: '' },
    operator: 'eq',
    right: { type: 'literal', value: '' },
  },
}

export function ConditionConfigForm({ config, onChange }: ConditionConfigFormProps) {
  const parsed: ParsedConditionConfig = useMemo(() => {
    if (!config) return defaultCondition
    try {
      return JSON.parse(config) as ParsedConditionConfig
    } catch {
      return defaultCondition
    }
  }, [config])

  const updateCondition = useCallback(
    (updates: Partial<ParsedConditionConfig['condition']>) => {
      onChange(JSON.stringify({ condition: { ...parsed.condition, ...updates } }))
    },
    [parsed, onChange],
  )

  const handleLeftChange = (value: string) => {
    // If it looks like a node ref (contains dots), treat as node reference
    // Otherwise treat as literal
    if (value.includes('.')) {
      const parts = value.split('.')
      const nodeId = parts[0]
      const path = parts.slice(1).join('.')
      updateCondition({ left: { type: 'node', nodeId, path } })
    } else {
      updateCondition({ left: { type: 'literal', value } })
    }
  }

  const handleRightChange = (value: string) => {
    if (value.includes('.')) {
      const parts = value.split('.')
      const nodeId = parts[0]
      const path = parts.slice(1).join('.')
      updateCondition({ right: { type: 'node', nodeId, path } })
    } else {
      updateCondition({ right: { type: 'literal', value } })
    }
  }

  const leftValue = parsed.condition.left.type === 'literal'
    ? String(parsed.condition.left.value ?? '')
    : parsed.condition.left.type === 'node'
      ? `${parsed.condition.left.nodeId}.${parsed.condition.left.path}`
      : String(parsed.condition.left.path ?? '')

  const rightValue = parsed.condition.right.type === 'literal'
    ? String(parsed.condition.right.value ?? '')
    : parsed.condition.right.type === 'node'
      ? `${parsed.condition.right.nodeId}.${parsed.condition.right.path}`
      : String(parsed.condition.right.path ?? '')

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>Left Value</Label>
        <input
          type="text"
          value={leftValue}
          onChange={(e) => handleLeftChange(e.target.value)}
          placeholder="value or nodeId.output.field"
          className="flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
        />
        <p className="text-[10px] text-[var(--color-text-tertiary)]">Use dot notation for node references (e.g., nodeId.output.status)</p>
      </div>

      <div className="space-y-1.5">
        <Label>Operator</Label>
        <Select value={parsed.condition.operator} onValueChange={(v) => updateCondition({ operator: v })}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="eq">equals (==)</SelectItem>
            <SelectItem value="neq">not equals (!=)</SelectItem>
            <SelectItem value="gt">greater than (&gt;)</SelectItem>
            <SelectItem value="gte">greater or equal (&gt;=)</SelectItem>
            <SelectItem value="lt">less than (&lt;)</SelectItem>
            <SelectItem value="lte">less or equal (&lt;=)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-1.5">
        <Label>Right Value</Label>
        <input
          type="text"
          value={rightValue}
          onChange={(e) => handleRightChange(e.target.value)}
          placeholder="value or nodeId.output.field"
          className="flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]"
        />
      </div>
    </div>
  )
}
