import { describe, it, expect, vi, beforeEach } from 'vitest'
import { EventEmitter } from 'events'
import { createHostFunctions, type PluginApiDeps } from '../../../src/main/plugins/plugin-api'
import type { HostFunctions } from '../../../src/main/plugins/isolate-sandbox'

function makeMockInboxRepo() {
  return {
    batchUpsert: vi.fn(),
    list: vi.fn().mockReturnValue([]),
    markRead: vi.fn(),
    archive: vi.fn(),
    deleteByPlugin: vi.fn()
  }
}

function makeMockSecretsBridge() {
  return {
    getPluginSecret: vi.fn().mockResolvedValue(null)
  }
}

describe('createHostFunctions', () => {
  let mockInboxRepo: ReturnType<typeof makeMockInboxRepo>
  let mockSecretsBridge: ReturnType<typeof makeMockSecretsBridge>
  let eventBus: EventEmitter
  let hostFns: HostFunctions
  let mockAiRegistry: PluginApiDeps['aiRegistry']

  beforeEach(() => {
    mockInboxRepo = makeMockInboxRepo()
    mockSecretsBridge = makeMockSecretsBridge()
    eventBus = new EventEmitter()
    mockAiRegistry = {
      getDefault: vi.fn().mockReturnValue(null)
    }

    const deps: PluginApiDeps = {
      inboxRepo: mockInboxRepo as any,
      secretsBridge: mockSecretsBridge as any,
      eventBus,
      aiRegistry: mockAiRegistry
    }
    hostFns = createHostFunctions(deps)
  })

  describe('fetch', () => {
    it('calls global fetch and returns parsed response', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'application/json' }),
        json: vi.fn().mockResolvedValue({ data: 'test' }),
        text: vi.fn()
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any)

      const result = await hostFns.fetch('test-plugin', 'https://api.example.com/data', {}) as any
      expect(result.status).toBe(200)
      expect(result.statusText).toBe('OK')
      expect(result.body).toEqual({ data: 'test' })
      expect(mockResponse.json).toHaveBeenCalled()

      vi.restoreAllMocks()
    })

    it('returns text body for non-JSON content types', async () => {
      const mockResponse = {
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'content-type': 'text/html' }),
        json: vi.fn(),
        text: vi.fn().mockResolvedValue('<html>hello</html>')
      }
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse as any)

      const result = await hostFns.fetch('test-plugin', 'https://example.com', undefined) as any
      expect(result.body).toBe('<html>hello</html>')
      expect(mockResponse.text).toHaveBeenCalled()
      expect(mockResponse.json).not.toHaveBeenCalled()

      vi.restoreAllMocks()
    })

    it('passes options through to global fetch', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        status: 200,
        statusText: 'OK',
        headers: new Headers(),
        text: vi.fn().mockResolvedValue('')
      } as any)

      const options = { method: 'POST', body: JSON.stringify({ key: 'value' }) }
      await hostFns.fetch('test-plugin', 'https://api.example.com', options)

      expect(fetchSpy).toHaveBeenCalledWith('https://api.example.com', options)
      vi.restoreAllMocks()
    })
  })

  describe('getSecret', () => {
    it('delegates to secretsBridge.getPluginSecret', async () => {
      mockSecretsBridge.getPluginSecret.mockResolvedValue('secret-value')

      const result = await hostFns.getSecret('my-plugin', 'API_KEY')
      expect(result).toBe('secret-value')
      expect(mockSecretsBridge.getPluginSecret).toHaveBeenCalledWith('my-plugin', 'API_KEY')
    })

    it('returns null when secret does not exist', async () => {
      mockSecretsBridge.getPluginSecret.mockResolvedValue(null)

      const result = await hostFns.getSecret('my-plugin', 'NONEXISTENT')
      expect(result).toBeNull()
    })
  })

  describe('storeItems', () => {
    it('maps and batch-upserts items with pluginId', async () => {
      const items = [
        {
          externalId: 'ext-1',
          type: 'email',
          title: 'Hello',
          body: 'World',
          preview: 'Pre',
          sourceUrl: 'https://example.com',
          priority: 'high',
          metadata: { from: 'alice' },
          isActionable: true,
          externalCreatedAt: 1700000000
        }
      ]

      await hostFns.storeItems('test-plugin', items)

      expect(mockInboxRepo.batchUpsert).toHaveBeenCalledWith([
        expect.objectContaining({
          pluginId: 'test-plugin',
          externalId: 'ext-1',
          type: 'email',
          title: 'Hello',
          body: 'World',
          preview: 'Pre',
          sourceUrl: 'https://example.com',
          priority: 3, // 'high' maps to 3
          metadata: JSON.stringify({ from: 'alice' }),
          isActionable: true,
          externalCreatedAt: 1700000000
        })
      ])
    })

    it('maps priority string names to numeric values', async () => {
      const items = [
        { id: '1', title: 'A', priority: 'critical' },
        { id: '2', title: 'B', priority: 'high' },
        { id: '3', title: 'C', priority: 'normal' },
        { id: '4', title: 'D', priority: 'low' }
      ]

      await hostFns.storeItems('p', items)

      const mapped = mockInboxRepo.batchUpsert.mock.calls[0][0]
      expect(mapped[0].priority).toBe(4)
      expect(mapped[1].priority).toBe(3)
      expect(mapped[2].priority).toBe(2)
      expect(mapped[3].priority).toBe(1)
    })

    it('passes numeric priority through as-is', async () => {
      await hostFns.storeItems('p', [{ id: '1', title: 'A', priority: 5 }])

      const mapped = mockInboxRepo.batchUpsert.mock.calls[0][0]
      expect(mapped[0].priority).toBe(5)
    })

    it('handles items with missing optional fields', async () => {
      await hostFns.storeItems('p', [{ title: 'Minimal' }])

      const mapped = mockInboxRepo.batchUpsert.mock.calls[0][0]
      expect(mapped[0].pluginId).toBe('p')
      expect(mapped[0].externalId).toBe('')
      expect(mapped[0].type).toBe('unknown')
      expect(mapped[0].title).toBe('Minimal')
      expect(mapped[0].body).toBeUndefined()
      expect(mapped[0].preview).toBeUndefined()
      expect(mapped[0].sourceUrl).toBeUndefined()
      expect(mapped[0].priority).toBeUndefined()
      expect(mapped[0].metadata).toBeUndefined()
      expect(mapped[0].isActionable).toBe(false)
      expect(mapped[0].externalCreatedAt).toBeUndefined()
    })

    it('uses externalId, falling back to id, then empty string', async () => {
      await hostFns.storeItems('p', [
        { externalId: 'ext-1', title: 'A' },
        { id: 'fallback-id', title: 'B' },
        { title: 'C' }
      ])

      const mapped = mockInboxRepo.batchUpsert.mock.calls[0][0]
      expect(mapped[0].externalId).toBe('ext-1')
      expect(mapped[1].externalId).toBe('fallback-id')
      expect(mapped[2].externalId).toBe('')
    })
  })

  describe('queryItems', () => {
    it('passes filter to inboxRepo.list scoped to pluginId', async () => {
      mockInboxRepo.list.mockReturnValue([{ id: 'item-1', title: 'Test' }])

      const result = await hostFns.queryItems('my-plugin', {
        types: ['email'],
        status: ['unread'],
        limit: 10,
        offset: 5
      })

      expect(mockInboxRepo.list).toHaveBeenCalledWith({
        pluginId: 'my-plugin',
        types: ['email'],
        status: ['unread'],
        limit: 10,
        offset: 5
      })
      expect(result).toEqual([{ id: 'item-1', title: 'Test' }])
    })

    it('uses defaults for missing filter fields', async () => {
      mockInboxRepo.list.mockReturnValue([])
      await hostFns.queryItems('my-plugin', null)

      expect(mockInboxRepo.list).toHaveBeenCalledWith({
        pluginId: 'my-plugin',
        types: undefined,
        status: undefined,
        limit: 50,
        offset: 0
      })
    })

    it('ignores non-array types and status', async () => {
      mockInboxRepo.list.mockReturnValue([])
      await hostFns.queryItems('my-plugin', { types: 'email', status: 'unread' })

      expect(mockInboxRepo.list).toHaveBeenCalledWith(
        expect.objectContaining({
          types: undefined,
          status: undefined
        })
      )
    })
  })

  describe('markRead', () => {
    it('only marks items belonging to the plugin', async () => {
      mockInboxRepo.list.mockReturnValue([
        { id: 'item-1' },
        { id: 'item-2' },
        { id: 'item-3' }
      ])

      await hostFns.markRead('my-plugin', ['item-1', 'item-3', 'foreign-item'])

      expect(mockInboxRepo.markRead).toHaveBeenCalledWith(['item-1', 'item-3'])
    })

    it('does not call markRead when no valid ids', async () => {
      mockInboxRepo.list.mockReturnValue([{ id: 'item-1' }])

      await hostFns.markRead('my-plugin', ['foreign-item'])

      expect(mockInboxRepo.markRead).not.toHaveBeenCalled()
    })
  })

  describe('archive', () => {
    it('only archives items belonging to the plugin', async () => {
      mockInboxRepo.list.mockReturnValue([
        { id: 'item-a' },
        { id: 'item-b' }
      ])

      await hostFns.archive('my-plugin', ['item-a', 'item-c'])

      expect(mockInboxRepo.archive).toHaveBeenCalledWith(['item-a'])
    })

    it('does not call archive when no valid ids', async () => {
      mockInboxRepo.list.mockReturnValue([])

      await hostFns.archive('my-plugin', ['id-x'])

      expect(mockInboxRepo.archive).not.toHaveBeenCalled()
    })
  })

  describe('emitEvent', () => {
    it('emits event on bus with pluginId-prefixed name', () => {
      const handler = vi.fn()
      eventBus.on('plugin:my-plugin:sync-complete', handler)

      hostFns.emitEvent('my-plugin', 'sync-complete', { count: 5 })

      expect(handler).toHaveBeenCalledWith({ count: 5 })
    })
  })

  describe('requestAI', () => {
    it('throws when aiRegistry is not available', async () => {
      const noAiDeps: PluginApiDeps = {
        inboxRepo: mockInboxRepo as any,
        secretsBridge: mockSecretsBridge as any,
        eventBus
      }
      const noAiFns = createHostFunctions(noAiDeps)

      await expect(noAiFns.requestAI('p', 'classify', {})).rejects.toThrow('AI not available')
    })

    it('throws when no default provider configured', async () => {
      (mockAiRegistry!.getDefault as ReturnType<typeof vi.fn>).mockReturnValue(null)

      await expect(hostFns.requestAI('p', 'classify', {})).rejects.toThrow('No AI provider configured')
    })

    it('throws for unknown AI operation', async () => {
      (mockAiRegistry!.getDefault as ReturnType<typeof vi.fn>).mockReturnValue({
        classify: vi.fn()
      })

      await expect(hostFns.requestAI('p', 'nonexistent', {})).rejects.toThrow('Unknown AI operation: nonexistent')
    })

    it('calls the requested operation on the default provider', async () => {
      const classifyFn = vi.fn().mockResolvedValue({ label: 'urgent' })
      const provider = { classify: classifyFn }
      ;(mockAiRegistry!.getDefault as ReturnType<typeof vi.fn>).mockReturnValue(provider)

      const result = await hostFns.requestAI('my-plugin', 'classify', { text: 'hello' })

      expect(classifyFn).toHaveBeenCalledWith({ text: 'hello' })
      expect(result).toEqual({ label: 'urgent' })
    })
  })
})
