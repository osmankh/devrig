import { memo, type ReactNode } from 'react'
import { Handle, Position } from '@xyflow/react'
import { cn } from '@shared/lib/cn'
import { useExecutionStore } from '@entities/execution/model/execution-store'
import { Badge } from '@shared/ui/badge'

export interface BaseNodeData {
  label: string
  config: string | null
  workflowId: string
  [key: string]: unknown
}

interface BaseNodeProps {
  id: string
  selected: boolean
  label: string
  icon: ReactNode
  accentColor: string // Tailwind border color class e.g. "border-l-amber-500"
  showTargetHandle?: boolean
  showSourceHandle?: boolean
  sourceHandles?: { id: string; label?: string; position?: number }[]
  children?: ReactNode
}

export const BaseNode = memo(function BaseNode({
  id,
  selected,
  label,
  icon,
  accentColor,
  showTargetHandle = true,
  showSourceHandle = true,
  sourceHandles,
  children,
}: BaseNodeProps) {
  const stepStatus = useExecutionStore((s) => s.steps[id]?.status)
  const durationMs = useExecutionStore((s) => s.steps[id]?.durationMs)

  // Execution status styling (separate from selection)
  const executionClasses = cn(
    stepStatus === 'running' && 'ring-2 ring-blue-500 animate-pulse',
    stepStatus === 'success' && 'ring-2 ring-green-500',
    stepStatus === 'error' && 'ring-2 ring-red-500',
    stepStatus === 'skipped' && 'opacity-50',
  )

  return (
    <div
      className={cn(
        'relative min-w-[180px] max-w-[260px] rounded-lg border border-[var(--color-border-default)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)] transition-shadow',
        'border-l-[3px]',
        accentColor,
        selected && 'ring-2 ring-[var(--color-accent-primary)] ring-offset-1 ring-offset-[var(--color-bg-primary)] shadow-[var(--shadow-md)]',
        executionClasses,
      )}
    >
      {/* Target handle (left) */}
      {showTargetHandle && (
        <Handle
          type="target"
          position={Position.Left}
          className="!h-3 !w-3 !border-2 !border-[var(--color-border-default)] !bg-[var(--color-bg-secondary)]"
        />
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2">
        <div className="flex h-6 w-6 items-center justify-center text-[var(--color-text-secondary)]">
          {icon}
        </div>
        <span className="flex-1 truncate text-xs font-medium text-[var(--color-text-primary)]">{label}</span>
        {/* Duration badge (shown after execution completes) */}
        {(stepStatus === 'success' || stepStatus === 'error') && durationMs != null && (
          <Badge variant="secondary" className="text-[10px] px-1 py-0">
            {durationMs < 1000 ? `${durationMs}ms` : `${(durationMs / 1000).toFixed(1)}s`}
          </Badge>
        )}
      </div>

      {/* Content */}
      {children && (
        <div className="border-t border-[var(--color-border-default)] px-3 py-2 text-[11px] text-[var(--color-text-secondary)]">
          {children}
        </div>
      )}

      {/* Source handle(s) (right) */}
      {showSourceHandle && !sourceHandles && (
        <Handle
          type="source"
          position={Position.Right}
          className="!h-3 !w-3 !border-2 !border-[var(--color-border-default)] !bg-[var(--color-bg-secondary)]"
        />
      )}
      {sourceHandles?.map((handle, index) => (
        <Handle
          key={handle.id}
          type="source"
          position={Position.Right}
          id={handle.id}
          className="!h-3 !w-3 !border-2 !border-[var(--color-border-default)] !bg-[var(--color-bg-secondary)]"
          style={{ top: handle.position ?? `${30 + index * 24}%` }}
        />
      ))}
    </div>
  )
})
