import { useEffect } from 'react'
import { useInboxStore } from '@entities/inbox-item'

export function useInboxKeyboard() {
  const sortedIds = useInboxStore((s) => s.sortedIds)
  const selectedItemId = useInboxStore((s) => s.selectedItemId)
  const selectItem = useInboxStore((s) => s.selectItem)
  const markRead = useInboxStore((s) => s.markRead)
  const archive = useInboxStore((s) => s.archive)
  const snooze = useInboxStore((s) => s.snooze)

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Skip if user is in an input/textarea
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return

      const currentIndex = selectedItemId
        ? sortedIds.indexOf(selectedItemId)
        : -1

      switch (e.key.toLowerCase()) {
        case 'j': {
          // Move down
          e.preventDefault()
          const nextIndex = Math.min(currentIndex + 1, sortedIds.length - 1)
          if (sortedIds[nextIndex]) {
            selectItem(sortedIds[nextIndex])
            markRead([sortedIds[nextIndex]])
          }
          break
        }
        case 'k': {
          // Move up
          e.preventDefault()
          const prevIndex = Math.max(currentIndex - 1, 0)
          if (sortedIds[prevIndex]) {
            selectItem(sortedIds[prevIndex])
            markRead([sortedIds[prevIndex]])
          }
          break
        }
        case 'e': {
          // Archive
          e.preventDefault()
          if (selectedItemId) {
            archive([selectedItemId])
            // Select next item
            const next = sortedIds[currentIndex + 1] ?? sortedIds[currentIndex - 1] ?? null
            selectItem(next)
          }
          break
        }
        case 'h': {
          // Snooze (3 hours)
          e.preventDefault()
          if (selectedItemId) {
            const until = Date.now() + 3 * 60 * 60 * 1000
            snooze(selectedItemId, until)
            const next = sortedIds[currentIndex + 1] ?? sortedIds[currentIndex - 1] ?? null
            selectItem(next)
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [sortedIds, selectedItemId, selectItem, markRead, archive, snooze])
}
