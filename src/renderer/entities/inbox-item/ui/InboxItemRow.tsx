import { memo, useCallback, type CSSProperties } from 'react'
import { Archive, Clock } from 'lucide-react'
import { cn } from '@shared/lib/cn'
import type { InboxItem, InboxPriority } from '../model/inbox-item.types'

const PLUGIN_COLORS: Record<string, string> = {
  gmail: 'bg-red-500',
  github: 'bg-zinc-700',
  linear: 'bg-violet-500',
  jira: 'bg-blue-500',
  sentry: 'bg-orange-500',
  datadog: 'bg-purple-500'
}

const PRIORITY_COLORS: Record<InboxPriority, string> = {
  0: '',
  1: 'bg-blue-400',
  2: 'bg-yellow-400',
  3: 'bg-red-400'
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now()
  const diff = now - timestamp
  const minutes = Math.floor(diff / 60000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  return `${Math.floor(days / 7)}w`
}

export interface InboxItemRowProps {
  item: InboxItem
  isSelected: boolean
  style?: CSSProperties
  onClick: (id: string) => void
  onArchive: (id: string) => void
  onSnooze: (id: string) => void
}

export const InboxItemRow = memo(function InboxItemRow({
  item,
  isSelected,
  style,
  onClick,
  onArchive,
  onSnooze
}: InboxItemRowProps) {
  const isUnread = item.status === 'unread'
  const pluginColor = PLUGIN_COLORS[item.pluginId] ?? 'bg-zinc-500'
  const priorityColor = PRIORITY_COLORS[item.priority]

  const handleClick = useCallback(() => {
    onClick(item.id)
  }, [onClick, item.id])

  const handleArchive = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onArchive(item.id)
    },
    [onArchive, item.id]
  )

  const handleSnooze = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      onSnooze(item.id)
    },
    [onSnooze, item.id]
  )

  return (
    <div
      role="button"
      tabIndex={0}
      style={style}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') handleClick()
      }}
      className={cn(
        'group flex h-[72px] cursor-pointer items-center gap-3 border-b border-border px-4',
        'transition-colors hover:bg-muted/50',
        isSelected && 'bg-muted',
        isUnread && 'bg-background'
      )}
    >
      {/* Unread indicator */}
      <div className="flex w-2 shrink-0 justify-center">
        {isUnread && (
          <div className="h-2 w-2 rounded-full bg-primary" />
        )}
      </div>

      {/* Plugin icon */}
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-medium text-white',
          pluginColor
        )}
      >
        {item.pluginId.charAt(0).toUpperCase()}
      </div>

      {/* Content */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'truncate text-sm',
              isUnread ? 'font-semibold text-foreground' : 'text-foreground/80'
            )}
          >
            {item.title}
          </span>
          {priorityColor && (
            <div className={cn('h-2 w-2 shrink-0 rounded-full', priorityColor)} />
          )}
        </div>
        <p className="truncate text-xs text-muted-foreground">
          {item.aiSummary ?? item.preview ?? ''}
        </p>
      </div>

      {/* Time + actions */}
      <div className="flex shrink-0 items-center gap-1">
        <span className="text-xs text-muted-foreground group-hover:hidden">
          {formatRelativeTime(item.externalCreatedAt ?? item.createdAt)}
        </span>
        <div className="hidden gap-1 group-hover:flex">
          <button
            type="button"
            onClick={handleArchive}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Archive"
          >
            <Archive className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleSnooze}
            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
            aria-label="Snooze"
          >
            <Clock className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  )
})
