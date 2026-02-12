import { useEffect } from 'react'
import { useInboxStore } from '@entities/inbox-item'
import { useRouterStore } from '@app/router/router'
import { InboxFilterBar } from '@features/inbox-filter'
import { InboxActionBar, useInboxKeyboard } from '@features/inbox-actions'
import { DetailPanel } from '@widgets/detail-panel'
import { AIDraftPanel } from '@widgets/ai-draft-panel'
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@shared/ui'
import { InboxList } from './InboxList'
import { onInboxUpdated, offInboxUpdated } from '@entities/inbox-item/api/inbox-ipc'

export function InboxPage() {
  const loadItems = useInboxStore((s) => s.loadItems)
  const loadStats = useInboxStore((s) => s.loadStats)
  const selectItem = useInboxStore((s) => s.selectItem)
  const selectedItemId = useInboxStore((s) => s.selectedItemId)
  const route = useRouterStore((s) => s.route)

  // Keyboard shortcuts
  useInboxKeyboard()

  // Initial load
  useEffect(() => {
    loadItems()
    loadStats()
  }, [loadItems, loadStats])

  // Deep-link: auto-select item from route
  useEffect(() => {
    if (route.view === 'inbox' && route.itemId) {
      selectItem(route.itemId)
    }
  }, [route, selectItem])

  // Listen for server-side updates
  useEffect(() => {
    const handleUpdated = () => {
      loadItems()
      loadStats()
    }
    onInboxUpdated(handleUpdated)
    return () => offInboxUpdated(handleUpdated)
  }, [loadItems, loadStats])

  return (
    <div className="flex h-full flex-col">
      {/* Page header */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-3">
        <h1 className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">
          Inbox
        </h1>
      </div>

      {/* Filter bar */}
      <InboxFilterBar />

      {/* Action bar */}
      <InboxActionBar />

      {/* 3-column layout: list + detail + AI draft */}
      <div className="flex-1 overflow-hidden">
        <ResizablePanelGroup orientation="horizontal">
          <ResizablePanel defaultSize={selectedItemId ? 35 : 100} minSize={25} maxSize={60}>
            <InboxList />
          </ResizablePanel>
          {selectedItemId && (
            <>
              <ResizableHandle />
              <ResizablePanel defaultSize={40} minSize={25}>
                <DetailPanel />
              </ResizablePanel>
              <ResizableHandle />
              <ResizablePanel defaultSize={25} minSize={20} maxSize={40}>
                <AIDraftPanel />
              </ResizablePanel>
            </>
          )}
        </ResizablePanelGroup>
      </div>
    </div>
  )
}
