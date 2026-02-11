import { useEffect, useState, useMemo } from 'react'
import { Play, ChevronRight, CheckCircle2, XCircle, Clock, Loader2, Ban } from 'lucide-react'
import { listExecutions, getExecutionWithSteps, runWorkflow } from '@entities/execution/api/execution-ipc'
import type { Execution, ExecutionWithSteps } from '@entities/execution/api/execution-ipc'
import { useFlowStore } from '@entities/flow/model/flow-store'
import { Button } from '@shared/ui/button'
import { Badge } from '@shared/ui/badge'
import { ScrollArea } from '@shared/ui/scroll-area'
import { cn } from '@shared/lib/cn'

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />,
  running: <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />,
  success: <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />,
  failed: <XCircle className="h-3.5 w-3.5 text-red-500" />,
  cancelled: <Ban className="h-3.5 w-3.5 text-[var(--color-text-tertiary)]" />,
}

const statusColors: Record<string, string> = {
  pending: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]',
  running: 'bg-blue-500/10 text-blue-500',
  success: 'bg-green-500/10 text-green-500',
  failed: 'bg-red-500/10 text-red-500',
  cancelled: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-tertiary)]',
}

function formatTime(ts: number | null): string {
  if (!ts) return '-'
  return new Date(ts).toLocaleString()
}

function formatDuration(start: number | null, end: number | null): string {
  if (!start) return '-'
  const duration = (end ?? Date.now()) - start
  if (duration < 1000) return `${duration}ms`
  return `${(duration / 1000).toFixed(1)}s`
}

export function ExecutionHistoryPage() {
  const [executions, setExecutions] = useState<Execution[]>([])
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedData, setExpandedData] = useState<ExecutionWithSteps | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const flows = useFlowStore((s) => s.flows)

  useEffect(() => {
    loadExecutions()
  }, [])

  const loadExecutions = async () => {
    setIsLoading(true)
    try {
      // Load executions for all flows
      const allExecs: Execution[] = []
      for (const flow of flows) {
        const execs = await listExecutions(flow.id)
        allExecs.push(...execs)
      }
      // Sort by most recent first
      allExecs.sort((a, b) => b.createdAt - a.createdAt)
      setExecutions(allExecs)
    } catch (error) {
      console.error('Failed to load executions:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleExpand = async (id: string) => {
    if (expandedId === id) {
      setExpandedId(null)
      setExpandedData(null)
      return
    }
    setExpandedId(id)
    try {
      const data = await getExecutionWithSteps(id)
      setExpandedData(data)
    } catch (error) {
      console.error('Failed to load execution details:', error)
    }
  }

  const handleRerun = async (workflowId: string) => {
    try {
      await runWorkflow(workflowId)
      // Refresh list after a delay
      setTimeout(loadExecutions, 1000)
    } catch (error) {
      console.error('Failed to re-run workflow:', error)
    }
  }

  const flowNames = useMemo(() => {
    const map = new Map<string, string>()
    flows.forEach((f) => map.set(f.id, f.name))
    return map
  }, [flows])

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-[var(--color-text-tertiary)]">
        Loading executions...
      </div>
    )
  }

  if (executions.length === 0) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-text-tertiary)]">
        <Clock className="h-8 w-8" />
        <span className="text-sm">No executions yet</span>
        <span className="text-xs">Run a workflow to see execution history</span>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="border-b border-[var(--color-border-subtle)] px-4 py-3">
        <h1 className="text-sm font-semibold text-[var(--color-text-primary)]">Execution History</h1>
        <p className="text-xs text-[var(--color-text-tertiary)]">{executions.length} executions</p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-px p-2">
          {executions.map((exec) => (
            <div key={exec.id} className="rounded-md border border-[var(--color-border-subtle)]">
              <button
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-[var(--color-bg-hover)]"
                onClick={() => handleExpand(exec.id)}
              >
                <ChevronRight
                  className={cn(
                    'h-3.5 w-3.5 text-[var(--color-text-tertiary)] transition-transform',
                    expandedId === exec.id && 'rotate-90',
                  )}
                />
                {statusIcons[exec.status]}
                <span className="flex-1 truncate text-xs text-[var(--color-text-primary)]">
                  {flowNames.get(exec.workflowId) ?? 'Unknown Flow'}
                </span>
                <Badge className={cn('text-[10px]', statusColors[exec.status])}>
                  {exec.status}
                </Badge>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  {exec.triggerType}
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  {formatTime(exec.startedAt)}
                </span>
                <span className="text-[11px] text-[var(--color-text-tertiary)]">
                  {formatDuration(exec.startedAt, exec.completedAt)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleRerun(exec.workflowId)
                  }}
                >
                  <Play className="h-3 w-3" />
                </Button>
              </button>

              {/* Expanded details */}
              {expandedId === exec.id && expandedData && (
                <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-6 py-2">
                  {expandedData.steps.length === 0 ? (
                    <span className="text-xs text-[var(--color-text-tertiary)]">No steps recorded</span>
                  ) : (
                    <div className="space-y-1">
                      {expandedData.steps.map((step) => (
                        <div key={step.id} className="flex items-center gap-2 text-xs">
                          {statusIcons[step.status] ?? statusIcons.pending}
                          <span className="text-[var(--color-text-primary)]">{step.nodeId}</span>
                          <span className="text-[var(--color-text-tertiary)]">{step.status}</span>
                          {step.durationMs != null && (
                            <span className="text-[var(--color-text-tertiary)]">{step.durationMs}ms</span>
                          )}
                          {step.error && (
                            <span className="truncate text-red-400" title={step.error}>
                              {step.error}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
