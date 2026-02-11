import { useMemo, useState } from 'react'
import { ChevronDown, ChevronUp, CheckCircle2, XCircle, Clock, Loader2, SkipForward } from 'lucide-react'
import { useExecutionStore } from '@entities/execution/model/execution-store'
import { useFlowStore } from '@entities/flow/model/flow-store'
import { ScrollArea } from '@shared/ui/scroll-area'
import { cn } from '@shared/lib/cn'

const statusConfig: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  pending: { icon: <Clock className="h-3.5 w-3.5" />, color: 'text-[var(--color-text-tertiary)]', label: 'Pending' },
  running: { icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />, color: 'text-blue-500', label: 'Running' },
  success: { icon: <CheckCircle2 className="h-3.5 w-3.5" />, color: 'text-green-500', label: 'Success' },
  error: { icon: <XCircle className="h-3.5 w-3.5" />, color: 'text-red-500', label: 'Error' },
  skipped: { icon: <SkipForward className="h-3.5 w-3.5" />, color: 'text-[var(--color-text-tertiary)]', label: 'Skipped' },
}

function formatDuration(ms: number | undefined): string {
  if (ms == null) return '-'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

export function ExecutionPanel() {
  const [expanded, setExpanded] = useState(true)
  const steps = useExecutionStore((s) => s.steps)
  const status = useExecutionStore((s) => s.status)
  const isRunning = useExecutionStore((s) => s.isRunning)
  const error = useExecutionStore((s) => s.error)
  const nodes = useFlowStore((s) => s.nodes)

  const stepList = useMemo(
    () => Object.values(steps).sort((a, b) => {
      // Sort: running first, then by status order
      const order: Record<string, number> = { running: 0, pending: 1, success: 2, error: 3, skipped: 4 }
      return (order[a.status] ?? 5) - (order[b.status] ?? 5)
    }),
    [steps],
  )

  const hasExecution = status !== null
  if (!hasExecution) return null

  const successCount = stepList.filter((s) => s.status === 'success').length
  const errorCount = stepList.filter((s) => s.status === 'error').length
  const totalDuration = stepList.reduce((sum, s) => sum + (s.durationMs ?? 0), 0)

  return (
    <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
      {/* Header */}
      <button
        className="flex w-full items-center justify-between px-3 py-1.5 hover:bg-[var(--color-bg-hover)]"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-text-primary)]">Execution</span>
          {isRunning && <Loader2 className="h-3 w-3 animate-spin text-blue-500" />}
          {status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
          {status === 'failed' && <XCircle className="h-3 w-3 text-red-500" />}
          <span className="text-[11px] text-[var(--color-text-tertiary)]">
            {successCount}/{stepList.length} steps · {formatDuration(totalDuration)}
          </span>
        </div>
        {expanded ? <ChevronDown className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" /> : <ChevronUp className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />}
      </button>

      {/* Body */}
      {expanded && (
        <ScrollArea className="max-h-[200px]">
          <div className="space-y-0.5 px-3 pb-2">
            {error && (
              <div className="mb-2 rounded bg-red-500/10 px-2 py-1.5 text-xs text-red-500">
                {error}
              </div>
            )}
            {stepList.map((step) => {
              const node = nodes[step.nodeId]
              const cfg = statusConfig[step.status] ?? statusConfig.pending
              return (
                <div
                  key={step.nodeId}
                  className="flex items-center gap-2 rounded px-2 py-1 text-xs hover:bg-[var(--color-bg-hover)]"
                >
                  <span className={cfg.color}>{cfg.icon}</span>
                  <span className="flex-1 truncate text-[var(--color-text-primary)]">
                    {node?.label ?? step.nodeId}
                  </span>
                  <span className="text-[11px] text-[var(--color-text-tertiary)]">
                    {formatDuration(step.durationMs)}
                  </span>
                  {step.error && (
                    <span className="max-w-[200px] truncate text-[11px] text-red-400" title={step.error}>
                      {step.error}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}
