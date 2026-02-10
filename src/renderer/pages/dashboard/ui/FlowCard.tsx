import type { Flow } from '@entities/flow'
import { Badge } from '@shared/ui'
import { useRouterStore } from '@app/router/router'

function formatRelativeTime(timestamp: number): string {
  const diff = Date.now() - timestamp
  const seconds = Math.floor(diff / 1000)
  if (seconds < 60) return 'just now'
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

const statusVariant = {
  draft: 'secondary',
  active: 'success',
  paused: 'warning',
  error: 'error'
} as const

export function FlowCard({ flow }: { flow: Flow }) {
  const navigate = useRouterStore((s) => s.navigate)

  return (
    <button
      onClick={() => navigate({ view: 'flow-editor', flowId: flow.id })}
      className="flex w-full items-center gap-3 rounded-[var(--radius-lg)] border border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4 py-3 text-left transition-colors duration-[var(--duration-fast)] hover:border-[var(--color-border-default)] hover:bg-[var(--color-bg-hover)]"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="truncate text-[var(--text-sm)] font-medium text-[var(--color-text-primary)]">
            {flow.name}
          </span>
          <Badge
            variant={
              statusVariant[flow.status as keyof typeof statusVariant] ??
              'secondary'
            }
          >
            {flow.status}
          </Badge>
        </div>
        {flow.description && (
          <p className="mt-0.5 truncate text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
            {flow.description}
          </p>
        )}
      </div>
      <span className="shrink-0 text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
        {formatRelativeTime(flow.updatedAt)}
      </span>
    </button>
  )
}
