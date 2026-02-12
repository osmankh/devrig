import { useCallback } from 'react'
import { Archive, Eye, EyeOff, Clock, RefreshCw } from 'lucide-react'
import { Button } from '@shared/ui'
import { useInboxStore } from '@entities/inbox-item'

export function InboxActionBar() {
  const selectedItemId = useInboxStore((s) => s.selectedItemId)
  const markRead = useInboxStore((s) => s.markRead)
  const markUnread = useInboxStore((s) => s.markUnread)
  const archive = useInboxStore((s) => s.archive)
  const snooze = useInboxStore((s) => s.snooze)
  const refreshItems = useInboxStore((s) => s.refreshItems)

  const handleMarkRead = useCallback(() => {
    if (selectedItemId) markRead([selectedItemId])
  }, [selectedItemId, markRead])

  const handleMarkUnread = useCallback(() => {
    if (selectedItemId) markUnread([selectedItemId])
  }, [selectedItemId, markUnread])

  const handleArchive = useCallback(() => {
    if (selectedItemId) archive([selectedItemId])
  }, [selectedItemId, archive])

  const handleSnooze = useCallback(() => {
    if (!selectedItemId) return
    // Default snooze: 3 hours from now
    const until = Date.now() + 3 * 60 * 60 * 1000
    snooze(selectedItemId, until)
  }, [selectedItemId, snooze])

  return (
    <div className="flex items-center gap-1 border-b border-border px-4 py-1.5">
      <Button
        variant="ghost"
        size="sm"
        onClick={refreshItems}
        className="h-7 gap-1 px-2 text-xs"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Refresh
      </Button>
      <div className="mx-1 h-4 w-px bg-border" />
      <Button
        variant="ghost"
        size="sm"
        onClick={handleMarkRead}
        disabled={!selectedItemId}
        className="h-7 gap-1 px-2 text-xs"
      >
        <Eye className="h-3.5 w-3.5" />
        Read
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleMarkUnread}
        disabled={!selectedItemId}
        className="h-7 gap-1 px-2 text-xs"
      >
        <EyeOff className="h-3.5 w-3.5" />
        Unread
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleArchive}
        disabled={!selectedItemId}
        className="h-7 gap-1 px-2 text-xs"
      >
        <Archive className="h-3.5 w-3.5" />
        Archive
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={handleSnooze}
        disabled={!selectedItemId}
        className="h-7 gap-1 px-2 text-xs"
      >
        <Clock className="h-3.5 w-3.5" />
        Snooze
      </Button>
      <div className="flex-1" />
      <span className="text-xs text-muted-foreground">
        <kbd className="rounded border border-border px-1 font-mono text-[10px]">J</kbd>
        <kbd className="ml-0.5 rounded border border-border px-1 font-mono text-[10px]">K</kbd>
        {' navigate '}
        <kbd className="rounded border border-border px-1 font-mono text-[10px]">E</kbd>
        {' archive '}
        <kbd className="rounded border border-border px-1 font-mono text-[10px]">H</kbd>
        {' snooze'}
      </span>
    </div>
  )
}
