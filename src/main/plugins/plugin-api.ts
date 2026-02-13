import { EventEmitter } from 'events'
import { InboxRepository } from '../db/repositories/inbox.repository'
import type { SecretsBridge } from '../ai/secrets-bridge'
import type { HostFunctions } from './isolate-sandbox'

export interface PluginApiDeps {
  inboxRepo: InboxRepository
  secretsBridge: SecretsBridge
  eventBus: EventEmitter
  aiRegistry?: {
    getDefault(): { [op: string]: (params: unknown) => Promise<unknown> } | null
  }
}

const PRIORITY_MAP: Record<string, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1
}

function toPriorityNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && value in PRIORITY_MAP) return PRIORITY_MAP[value]
  return undefined
}

export function createHostFunctions(deps: PluginApiDeps): HostFunctions {
  const { inboxRepo, secretsBridge, eventBus } = deps

  return {
    async fetch(_pluginId: string, url: string, options: unknown): Promise<unknown> {
      const opts = options as RequestInit | undefined
      const resp = await globalThis.fetch(url, opts)
      const contentType = resp.headers.get('content-type') ?? ''
      const body = contentType.includes('application/json')
        ? await resp.json()
        : await resp.text()
      return {
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
        body
      }
    },

    async getSecret(pluginId: string, key: string): Promise<string | null> {
      return secretsBridge.getPluginSecret(pluginId, key)
    },

    async storeItems(pluginId: string, items: unknown[]): Promise<void> {
      const mapped = (items as Array<Record<string, unknown>>).map((item) => ({
        pluginId,
        externalId: String(item.externalId ?? item.id ?? ''),
        type: String(item.type ?? 'unknown'),
        title: String(item.title ?? ''),
        body: item.body != null ? String(item.body) : undefined,
        preview: item.preview != null ? String(item.preview) : undefined,
        sourceUrl: item.sourceUrl != null ? String(item.sourceUrl) : undefined,
        priority: toPriorityNumber(item.priority),
        metadata: item.metadata != null ? JSON.stringify(item.metadata) : undefined,
        isActionable: item.isActionable === true,
        externalCreatedAt: typeof item.externalCreatedAt === 'number' ? item.externalCreatedAt : undefined
      }))
      inboxRepo.batchUpsert(mapped)
    },

    async queryItems(pluginId: string, filter: unknown): Promise<unknown[]> {
      const f = (filter ?? {}) as Record<string, unknown>
      return inboxRepo.list({
        pluginId,
        types: Array.isArray(f.types) ? f.types as string[] : undefined,
        status: Array.isArray(f.status) ? f.status as string[] : undefined,
        limit: typeof f.limit === 'number' ? f.limit : 50,
        offset: typeof f.offset === 'number' ? f.offset : 0
      })
    },

    async markRead(pluginId: string, ids: string[]): Promise<void> {
      // Only mark items belonging to this plugin
      const items = inboxRepo.list({ pluginId, limit: 10000 })
      const pluginItemIds = new Set(items.map((i) => i.id))
      const validIds = ids.filter((id) => pluginItemIds.has(id))
      if (validIds.length > 0) {
        inboxRepo.markRead(validIds)
      }
    },

    async archive(pluginId: string, ids: string[]): Promise<void> {
      const items = inboxRepo.list({ pluginId, limit: 10000 })
      const pluginItemIds = new Set(items.map((i) => i.id))
      const validIds = ids.filter((id) => pluginItemIds.has(id))
      if (validIds.length > 0) {
        inboxRepo.archive(validIds)
      }
    },

    emitEvent(pluginId: string, name: string, data: unknown): void {
      eventBus.emit(`plugin:${pluginId}:${name}`, data)
    },

    async requestAI(pluginId: string, operation: string, params: unknown): Promise<unknown> {
      if (!deps.aiRegistry) throw new Error('AI not available')
      const provider = deps.aiRegistry.getDefault()
      if (!provider) throw new Error('No AI provider configured')
      const fn = provider[operation]
      if (typeof fn !== 'function') throw new Error(`Unknown AI operation: ${operation}`)
      return fn.call(provider, params)
    }
  }
}
