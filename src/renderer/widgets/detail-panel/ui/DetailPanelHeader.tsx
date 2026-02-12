import { ExternalLink, Clock, Tag } from 'lucide-react'
import { Badge } from '@shared/ui'
import type { InboxItem, InboxPriority } from '@entities/inbox-item'

const PRIORITY_LABELS: Record<InboxPriority, string> = {
  0: 'None',
  1: 'Low',
  2: 'Medium',
  3: 'High'
}

const PRIORITY_VARIANTS: Record<InboxPriority, 'default' | 'secondary' | 'outline' | 'error'> = {
  0: 'outline',
  1: 'secondary',
  2: 'default',
  3: 'error'
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

export function DetailPanelHeader({ item }: { item: InboxItem }) {
  return (
    <div className="border-b border-border px-4 py-3">
      <div className="flex items-start gap-2">
        <h2 className="flex-1 text-sm font-semibold leading-snug text-foreground">
          {item.title}
        </h2>
        {item.sourceUrl && (
          <a
            href={item.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-0.5 shrink-0 text-muted-foreground hover:text-foreground"
            title="Open in browser"
          >
            <ExternalLink className="h-4 w-4" />
          </a>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <Badge variant="outline" className="text-xs">
          {item.type}
        </Badge>
        {item.priority > 0 && (
          <Badge variant={PRIORITY_VARIANTS[item.priority]} className="text-xs">
            {PRIORITY_LABELS[item.priority]}
          </Badge>
        )}
        {item.isActionable && (
          <Badge variant="default" className="text-xs">
            Actionable
          </Badge>
        )}
        {item.aiClassification && (
          <Badge variant="secondary" className="gap-1 text-xs">
            <Tag className="h-3 w-3" />
            {item.aiClassification.label}
          </Badge>
        )}
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
        <span>via {item.pluginId}</span>
        {item.externalCreatedAt && (
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formatDate(item.externalCreatedAt)}
          </span>
        )}
        {item.snoozedUntil && (
          <span className="text-yellow-500">
            Snoozed until {formatDate(item.snoozedUntil)}
          </span>
        )}
      </div>
    </div>
  )
}
