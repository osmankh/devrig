import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { AIProviderInfo, AIUsage, AIUsageByProvider } from './ai.types'
import * as api from '../api/ai-ipc'

interface AIState {
  providers: AIProviderInfo[]
  usage: AIUsage | null
  usageByProvider: AIUsageByProvider[]
  isLoading: boolean

  loadProviders: () => Promise<void>
  loadUsage: (dateFrom?: number, dateTo?: number) => Promise<void>
  setDefaultProvider: (providerId: string) => Promise<void>
  classifyItems: (itemIds: string[]) => Promise<void>
  summarizeItem: (itemId: string) => Promise<string>
  draftResponse: (itemId: string, intent?: string) => Promise<string>
}

export const useAIStore = create<AIState>()(
  immer((set) => ({
    providers: [],
    usage: null,
    usageByProvider: [],
    isLoading: false,

    loadProviders: async () => {
      set((s) => {
        s.isLoading = true
      })
      try {
        const providers = await api.getProviders()
        set((s) => {
          s.providers = providers
          s.isLoading = false
        })
      } catch {
        set((s) => {
          s.isLoading = false
        })
      }
    },

    loadUsage: async (dateFrom, dateTo) => {
      try {
        const result = await api.getUsage(dateFrom, dateTo)
        set((s) => {
          s.usage = result.total
          s.usageByProvider = result.byProvider
        })
      } catch {
        // Usage is non-critical
      }
    },

    setDefaultProvider: async (providerId) => {
      // Optimistic update
      set((s) => {
        for (const p of s.providers) {
          p.isDefault = p.id === providerId
        }
      })
      try {
        await api.setDefaultProvider(providerId)
      } catch {
        // Reload on error to get correct state
        await api.getProviders().then((providers) => {
          set((s) => {
            s.providers = providers
          })
        })
      }
    },

    classifyItems: async (itemIds) => {
      await api.classifyItems(itemIds)
    },

    summarizeItem: async (itemId) => {
      return api.summarizeItem(itemId)
    },

    draftResponse: async (itemId, intent) => {
      return api.draftResponse(itemId, intent)
    }
  }))
)
