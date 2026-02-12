import { useMemo, useCallback, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@shared/ui/select'
import { Label } from '@shared/ui/label'
import { Button } from '@shared/ui/button'

interface ConditionConfigFormProps {
  config: string | null
  onChange: (config: string) => void
}

interface CompareRow {
  type: 'compare'
  left: { type: string; value?: string | number | boolean; nodeId?: string; path?: string }
  operator: string
  right: { type: string; value?: string | number | boolean; nodeId?: string; path?: string }
}

type ConditionExpr =
  | CompareRow
  | { type: 'and'; conditions: ConditionExpr[] }
  | { type: 'or'; conditions: ConditionExpr[] }

interface ParsedConditionConfig {
  condition: ConditionExpr
}

const defaultCompare: CompareRow = {
  type: 'compare',
  left: { type: 'literal', value: '' },
  operator: 'eq',
  right: { type: 'literal', value: '' },
}

const defaultCondition: ParsedConditionConfig = {
  condition: defaultCompare,
}

/** Normalize any condition shape into a flat list of compare rows + a logic operator */
function flattenCondition(condition: ConditionExpr): { logic: 'and' | 'or'; rows: CompareRow[] } {
  if (condition.type === 'compare') {
    return { logic: 'and', rows: [condition] }
  }
  // Compound: extract only top-level compare children (nested compounds not supported in UI)
  const rows = condition.conditions.filter((c): c is CompareRow => c.type === 'compare')
  if (rows.length === 0) rows.push({ ...defaultCompare })
  return { logic: condition.type, rows }
}

/** Build the condition expression from flat rows + logic operator */
function buildCondition(logic: 'and' | 'or', rows: CompareRow[]): ConditionExpr {
  if (rows.length === 1) return rows[0]
  return { type: logic, conditions: rows }
}

function parseValueRef(value: string): CompareRow['left'] {
  if (value.includes('.')) {
    const parts = value.split('.')
    return { type: 'node', nodeId: parts[0], path: parts.slice(1).join('.') }
  }
  return { type: 'literal', value }
}

function displayValueRef(ref: CompareRow['left']): string {
  if (ref.type === 'literal') return String(ref.value ?? '')
  if (ref.type === 'node') return `${ref.nodeId}.${ref.path}`
  return String(ref.path ?? '')
}

const inputClass =
  'flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-border-focus)]'

const inputErrorClass =
  'flex h-8 w-full rounded-[var(--radius-md)] border border-[var(--color-danger)] bg-[var(--color-bg-secondary)] px-2.5 text-[var(--text-xs)] text-[var(--color-text-primary)] font-mono focus:outline-none focus:ring-2 focus:ring-[var(--color-danger)]'

function validateRef(ref: CompareRow['left']): string | undefined {
  if (ref.type === 'literal' && (!ref.value || String(ref.value).trim() === '')) {
    return 'Value is required'
  }
  if (ref.type === 'node' && (!ref.nodeId || !ref.path)) {
    return 'Invalid node reference (use nodeId.path format)'
  }
  return undefined
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null
  return <p className="text-[10px] text-[var(--color-danger)]">{message}</p>
}

function CompareRowEditor({
  row,
  onChange,
  onRemove,
  canRemove,
}: {
  row: CompareRow
  onChange: (updated: CompareRow) => void
  onRemove: () => void
  canRemove: boolean
}) {
  const [touched, setTouched] = useState<Record<string, boolean>>({})

  const leftError = validateRef(row.left)
  const rightError = validateRef(row.right)

  return (
    <div className="space-y-2 rounded-[var(--radius-md)] border border-[var(--color-border-subtle)] p-2.5">
      <div className="flex items-center justify-between">
        <Label className="text-[10px] uppercase tracking-wider text-[var(--color-text-tertiary)]">Comparison</Label>
        {canRemove && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove}>
            <Trash2 className="h-3 w-3" />
          </Button>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>
          Left Value <span className="text-[var(--color-danger)]">*</span>
        </Label>
        <input
          type="text"
          value={displayValueRef(row.left)}
          onChange={(e) => onChange({ ...row, left: parseValueRef(e.target.value) })}
          onBlur={() => setTouched((p) => ({ ...p, left: true }))}
          placeholder="value or nodeId.output.field"
          className={touched.left && leftError ? inputErrorClass : inputClass}
        />
        <FieldError message={touched.left ? leftError : undefined} />
      </div>

      <div className="space-y-1.5">
        <Label>Operator</Label>
        <Select value={row.operator} onValueChange={(v) => onChange({ ...row, operator: v })}>
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
        <Label>
          Right Value <span className="text-[var(--color-danger)]">*</span>
        </Label>
        <input
          type="text"
          value={displayValueRef(row.right)}
          onChange={(e) => onChange({ ...row, right: parseValueRef(e.target.value) })}
          onBlur={() => setTouched((p) => ({ ...p, right: true }))}
          placeholder="value or nodeId.output.field"
          className={touched.right && rightError ? inputErrorClass : inputClass}
        />
        <FieldError message={touched.right ? rightError : undefined} />
      </div>
    </div>
  )
}

export function ConditionConfigForm({ config, onChange }: ConditionConfigFormProps) {
  const { logic, rows } = useMemo(() => {
    if (!config) return flattenCondition(defaultCompare)
    try {
      const parsed = JSON.parse(config) as ParsedConditionConfig
      return flattenCondition(parsed.condition)
    } catch {
      return flattenCondition(defaultCompare)
    }
  }, [config])

  const emit = useCallback(
    (newLogic: 'and' | 'or', newRows: CompareRow[]) => {
      onChange(JSON.stringify({ condition: buildCondition(newLogic, newRows) }))
    },
    [onChange],
  )

  const updateRow = useCallback(
    (index: number, updated: CompareRow) => {
      const newRows = [...rows]
      newRows[index] = updated
      emit(logic, newRows)
    },
    [rows, logic, emit],
  )

  const removeRow = useCallback(
    (index: number) => {
      const newRows = rows.filter((_, i) => i !== index)
      emit(logic, newRows.length > 0 ? newRows : [{ ...defaultCompare }])
    },
    [rows, logic, emit],
  )

  const addRow = useCallback(() => {
    emit(logic, [...rows, { ...defaultCompare }])
  }, [rows, logic, emit])

  const toggleLogic = useCallback(() => {
    emit(logic === 'and' ? 'or' : 'and', rows)
  }, [rows, logic, emit])

  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i}>
          {i > 0 && (
            <div className="flex items-center justify-center py-1">
              <button
                type="button"
                onClick={toggleLogic}
                className="rounded-[var(--radius-sm)] border border-[var(--color-border-default)] bg-[var(--color-bg-tertiary)] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]"
              >
                {logic}
              </button>
            </div>
          )}
          <CompareRowEditor
            row={row}
            onChange={(updated) => updateRow(i, updated)}
            onRemove={() => removeRow(i)}
            canRemove={rows.length > 1}
          />
        </div>
      ))}

      <Button variant="outline" size="sm" className="w-full gap-1.5 text-[var(--text-xs)]" onClick={addRow}>
        <Plus className="h-3 w-3" />
        Add condition
      </Button>

      {rows.length === 1 && (
        <p className="text-[10px] text-[var(--color-text-tertiary)]">
          Use dot notation for node references (e.g., nodeId.output.status)
        </p>
      )}
    </div>
  )
}
