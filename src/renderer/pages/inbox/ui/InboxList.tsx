import { useCallback, useEffect, useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useInboxStore, InboxItemRow } from '@entities/inbox-item'
import { Skeleton } from '@shared/ui'

const ROW_HEIGHT = 72

export function InboxList() {
  const sortedIds = useInboxStore((s) => s.sortedIds)
  const items = useInboxStore((s) => s.items)
  const selectedItemId = useInboxStore((s) => s.selectedItemId)
  const selectItem = useInboxStore((s) => s.selectItem)
  const markRead = useInboxStore((s) => s.markRead)
  const archive = useInboxStore((s) => s.archive)
  const snooze = useInboxStore((s) => s.snooze)
  const hasMore = useInboxStore((s) => s.hasMore)
  const isLoading = useInboxStore((s) => s.isLoading)
  const loadMore = useInboxStore((s) => s.loadMore)

  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: sortedIds.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10
  })

  // Infinite scroll: load more when near bottom
  useEffect(() => {
    const items = virtualizer.getVirtualItems()
    const lastItem = items[items.length - 1]
    if (!lastItem) return
    if (lastItem.index >= sortedIds.length - 5 && hasMore && !isLoading) {
      loadMore()
    }
  }, [virtualizer.getVirtualItems(), sortedIds.length, hasMore, isLoading, loadMore])

  // Scroll selected item into view
  useEffect(() => {
    if (!selectedItemId) return
    const index = sortedIds.indexOf(selectedItemId)
    if (index >= 0) {
      virtualizer.scrollToIndex(index, { align: 'auto' })
    }
  }, [selectedItemId, sortedIds, virtualizer])

  const handleClick = useCallback(
    (id: string) => {
      selectItem(id)
      markRead([id])
    },
    [selectItem, markRead]
  )

  const handleArchive = useCallback(
    (id: string) => {
      archive([id])
    },
    [archive]
  )

  const handleSnooze = useCallback(
    (id: string) => {
      const until = Date.now() + 3 * 60 * 60 * 1000
      snooze(id, until)
    },
    [snooze]
  )

  if (sortedIds.length === 0 && !isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-muted-foreground">
        <p className="text-sm">No items in your inbox</p>
        <p className="mt-1 text-xs">Connect a plugin to start receiving items</p>
      </div>
    )
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => {
          const itemId = sortedIds[virtualRow.index]
          const item = items[itemId]
          if (!item) return null

          return (
            <InboxItemRow
              key={item.id}
              item={item}
              isSelected={item.id === selectedItemId}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`
              }}
              onClick={handleClick}
              onArchive={handleArchive}
              onSnooze={handleSnooze}
            />
          )
        })}
      </div>
      {isLoading && (
        <div className="flex flex-col gap-1 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[72px] w-full" />
          ))}
        </div>
      )}
    </div>
  )
}
