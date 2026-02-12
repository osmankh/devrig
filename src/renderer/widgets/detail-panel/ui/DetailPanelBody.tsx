import { cn } from '@shared/lib/cn'
import type { InboxItem } from '@entities/inbox-item'

export function DetailPanelBody({ item }: { item: InboxItem }) {
  return (
    <div className="flex-1 overflow-auto px-4 py-3">
      <div
        className={cn(
          'whitespace-pre-wrap text-sm leading-relaxed text-foreground/90',
          !item.body && 'text-muted-foreground italic'
        )}
      >
        {item.body ?? 'No content available'}
      </div>

      {/* Metadata section for additional item-specific data */}
      {Object.keys(item.metadata).length > 0 && (
        <div className="mt-4 rounded-md border border-border p-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">
            Metadata
          </p>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {Object.entries(item.metadata).map(([key, value]) => (
              <div key={key} className="flex items-baseline gap-1.5">
                <span className="text-xs text-muted-foreground">{key}:</span>
                <span className="truncate text-xs text-foreground">
                  {String(value)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
