import { ipcInvoke, ipcOn, ipcOff } from '@shared/lib/ipc'
import type { InboxItem, InboxFilters, InboxStats } from '../model/inbox-item.types'

export async function listInboxItems(
  filters?: InboxFilters
): Promise<{ items: InboxItem[]; hasMore: boolean }> {
  return ipcInvoke<{ items: InboxItem[]; hasMore: boolean }>(
    'inbox:list',
    filters
  )
}

export async function getInboxItem(id: string): Promise<InboxItem> {
  return ipcInvoke<InboxItem>('inbox:get', id)
}

export async function searchInboxItems(
  query: string,
  filters?: InboxFilters
): Promise<{ items: InboxItem[]; hasMore: boolean }> {
  return ipcInvoke<{ items: InboxItem[]; hasMore: boolean }>(
    'inbox:search',
    query,
    filters
  )
}

export async function markRead(ids: string[]): Promise<void> {
  return ipcInvoke<void>('inbox:markRead', ids)
}

export async function markUnread(ids: string[]): Promise<void> {
  return ipcInvoke<void>('inbox:markUnread', ids)
}

export async function archiveItems(ids: string[]): Promise<void> {
  return ipcInvoke<void>('inbox:archive', ids)
}

export async function snoozeItem(id: string, until: number): Promise<void> {
  return ipcInvoke<void>('inbox:snooze', id, until)
}

export async function unsnoozeItem(id: string): Promise<void> {
  return ipcInvoke<void>('inbox:unsnooze', id)
}

export async function getInboxStats(): Promise<InboxStats> {
  return ipcInvoke<InboxStats>('inbox:getStats')
}

export function onInboxUpdated(callback: () => void): void {
  ipcOn('inbox:updated', callback)
}

export function offInboxUpdated(callback: () => void): void {
  ipcOff('inbox:updated', callback)
}
