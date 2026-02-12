import { useEffect } from 'react'
import { toast } from 'sonner'
import { ipcOn, ipcOff } from '@shared/lib/ipc'

/**
 * Subscribe to IPC events and show toast notifications.
 * Call once at the app root level.
 */
export function useNotifications() {
  useEffect(() => {
    function onSyncComplete(...args: unknown[]) {
      const data = args[0] as {
        pluginId?: string
        dataSourceId?: string
        itemsSynced?: number
      } | undefined
      if (!data) return
      const count = data.itemsSynced ?? 0
      if (count > 0) {
        toast.success(`Sync complete`, {
          description: `${count} new item${count !== 1 ? 's' : ''} synced`
        })
      }
    }

    function onInboxUpdated(...args: unknown[]) {
      const data = args[0] as { unsnoozed?: number } | undefined
      if (data?.unsnoozed && data.unsnoozed > 0) {
        toast.info(`${data.unsnoozed} item${data.unsnoozed !== 1 ? 's' : ''} unsnoozed`)
      }
    }

    function onPipelineProgress(...args: unknown[]) {
      const data = args[0] as {
        operation?: string
        status?: string
        itemId?: string
      } | undefined
      if (data?.status === 'complete' && data.operation === 'draft') {
        toast.success('AI draft ready', {
          description: 'A new AI draft has been generated'
        })
      }
    }

    ipcOn('plugin:sync-complete', onSyncComplete)
    ipcOn('inbox:updated', onInboxUpdated)
    ipcOn('ai:pipeline-progress', onPipelineProgress)

    return () => {
      ipcOff('plugin:sync-complete', onSyncComplete)
      ipcOff('inbox:updated', onInboxUpdated)
      ipcOff('ai:pipeline-progress', onPipelineProgress)
    }
  }, [])
}
