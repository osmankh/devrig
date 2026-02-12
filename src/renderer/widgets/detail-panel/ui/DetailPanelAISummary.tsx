import { Sparkles } from 'lucide-react'
import { Badge } from '@shared/ui'
import type { InboxItem } from '@entities/inbox-item'

export function DetailPanelAISummary({ item }: { item: InboxItem }) {
  if (!item.aiSummary && !item.aiClassification) return null

  return (
    <div className="border-b border-border bg-muted/30 px-4 py-2.5">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Sparkles className="h-3 w-3" />
        AI Insights
      </div>
      {item.aiSummary && (
        <p className="mt-1 text-sm leading-relaxed text-foreground">
          {item.aiSummary}
        </p>
      )}
      {item.aiClassification && (
        <div className="mt-1.5 flex items-center gap-2">
          <Badge variant="secondary" className="text-xs">
            {item.aiClassification.label}
          </Badge>
          <span className="text-xs text-muted-foreground">
            {Math.round(item.aiClassification.confidence * 100)}% confidence
          </span>
          {item.aiClassification.reasoning && (
            <span className="text-xs text-muted-foreground">
              — {item.aiClassification.reasoning}
            </span>
          )}
        </div>
      )}
    </div>
  )
}
