import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { InboxItem, InboxFilters, InboxStats } from './inbox-item.types'
import * as api from '../api/inbox-ipc'

interface InboxState {
  // Data
  items: Record<string, InboxItem>
  sortedIds: string[]
  filters: InboxFilters
  selectedItemId: string | null
  isLoading: boolean
  hasMore: boolean
  stats: InboxStats

  // Actions
  loadItems: (filters?: InboxFilters) => Promise<void>
  loadMore: () => Promise<void>
  refreshItems: () => Promise<void>
  selectItem: (id: string | null) => void
  setFilters: (filters: Partial<InboxFilters>) => void
  markRead: (ids: string[]) => Promise<void>
  markUnread: (ids: string[]) => Promise<void>
  archive: (ids: string[]) => Promise<void>
  snooze: (id: string, until: number) => Promise<void>
  unsnooze: (id: string) => Promise<void>
  loadStats: () => Promise<void>

  // Internal
  _updateItem: (id: string, partial: Partial<InboxItem>) => void
}

export const useInboxStore = create<InboxState>()(
  immer((set, get) => ({
    items: {},
    sortedIds: [],
    filters: {},
    selectedItemId: null,
    isLoading: false,
    hasMore: false,
    stats: { unreadCount: 0, actionableCount: 0, pluginCounts: {} },

    loadItems: async (filters) => {
      const appliedFilters = filters ?? get().filters
      set((s) => {
        s.isLoading = true
        if (filters) s.filters = appliedFilters
      })
      try {
        const result = await api.listInboxItems(appliedFilters)
        if (!result || !Array.isArray(result.items)) {
          set((s) => { s.isLoading = false })
          return
        }
        set((s) => {
          s.items = {}
          s.sortedIds = []
          for (const item of result.items) {
            s.items[item.id] = item
            s.sortedIds.push(item.id)
          }
          s.hasMore = result.hasMore
          s.isLoading = false
        })
      } catch {
        set((s) => {
          s.isLoading = false
        })
      }
    },

    loadMore: async () => {
      const state = get()
      if (state.isLoading || !state.hasMore) return

      const lastId = state.sortedIds[state.sortedIds.length - 1]
      if (!lastId) return

      set((s) => {
        s.isLoading = true
      })
      try {
        const result = await api.listInboxItems({
          ...state.filters,
          afterId: lastId
        })
        set((s) => {
          for (const item of result.items) {
            s.items[item.id] = item
            s.sortedIds.push(item.id)
          }
          s.hasMore = result.hasMore
          s.isLoading = false
        })
      } catch {
        set((s) => {
          s.isLoading = false
        })
      }
    },

    refreshItems: async () => {
      await get().loadItems()
      await get().loadStats()
    },

    selectItem: (id) => {
      set((s) => {
        s.selectedItemId = id
      })
    },

    setFilters: (filters) => {
      const merged = { ...get().filters, ...filters }
      get().loadItems(merged)
    },

    markRead: async (ids) => {
      // Optimistic update
      const previous = ids.map((id) => ({
        id,
        status: get().items[id]?.status
      }))
      set((s) => {
        for (const id of ids) {
          if (s.items[id]) s.items[id].status = 'read'
        }
      })
      try {
        await api.markRead(ids)
      } catch {
        // Revert on error
        set((s) => {
          for (const { id, status } of previous) {
            if (s.items[id] && status) s.items[id].status = status
          }
        })
      }
    },

    markUnread: async (ids) => {
      const previous = ids.map((id) => ({
        id,
        status: get().items[id]?.status
      }))
      set((s) => {
        for (const id of ids) {
          if (s.items[id]) s.items[id].status = 'unread'
        }
      })
      try {
        await api.markUnread(ids)
      } catch {
        set((s) => {
          for (const { id, status } of previous) {
            if (s.items[id] && status) s.items[id].status = status
          }
        })
      }
    },

    archive: async (ids) => {
      const previous = ids.map((id) => ({
        id,
        status: get().items[id]?.status
      }))
      set((s) => {
        for (const id of ids) {
          if (s.items[id]) s.items[id].status = 'archived'
        }
        // Remove archived items from sorted list
        s.sortedIds = s.sortedIds.filter((sid) => !ids.includes(sid))
      })
      try {
        await api.archiveItems(ids)
      } catch {
        set((s) => {
          for (const { id, status } of previous) {
            if (s.items[id] && status) {
              s.items[id].status = status
              if (!s.sortedIds.includes(id)) s.sortedIds.push(id)
            }
          }
        })
      }
    },

    snooze: async (id, until) => {
      const previous = get().items[id]
      set((s) => {
        if (s.items[id]) {
          s.items[id].status = 'snoozed'
          s.items[id].snoozedUntil = until
        }
        s.sortedIds = s.sortedIds.filter((sid) => sid !== id)
      })
      try {
        await api.snoozeItem(id, until)
      } catch {
        set((s) => {
          if (previous && s.items[id]) {
            s.items[id].status = previous.status
            s.items[id].snoozedUntil = previous.snoozedUntil
            if (!s.sortedIds.includes(id)) s.sortedIds.push(id)
          }
        })
      }
    },

    unsnooze: async (id) => {
      const previous = get().items[id]
      set((s) => {
        if (s.items[id]) {
          s.items[id].status = 'unread'
          s.items[id].snoozedUntil = null
        }
      })
      try {
        await api.unsnoozeItem(id)
      } catch {
        set((s) => {
          if (previous && s.items[id]) {
            s.items[id].status = previous.status
            s.items[id].snoozedUntil = previous.snoozedUntil
          }
        })
      }
    },

    loadStats: async () => {
      try {
        const stats = await api.getInboxStats()
        if (stats && typeof stats === 'object' && 'unreadCount' in stats) {
          set((s) => {
            s.stats = stats
          })
        }
      } catch {
        // Stats are non-critical, fail silently
      }
    },

    _updateItem: (id, partial) => {
      set((s) => {
        if (s.items[id]) {
          Object.assign(s.items[id], partial)
        }
      })
    }
  }))
)
