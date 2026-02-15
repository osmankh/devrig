import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock ipc-security
// ---------------------------------------------------------------------------
const handlers: Record<string, Function> = {}

vi.mock('../../../src/main/ipc-security', () => ({
  secureHandle: vi.fn((channel: string, handler: Function) => {
    handlers[channel] = handler
  })
}))

import { registerInboxHandlers } from '../../../src/main/ipc/inbox-handlers'

// ---------------------------------------------------------------------------
// Mock inbox repository
// ---------------------------------------------------------------------------
function makeMockInbox() {
  return {
    list: vi.fn(() => []),
    get: vi.fn(),
    search: vi.fn(() => []),
    update: vi.fn(),
    markRead: vi.fn(),
    markUnread: vi.fn(),
    archive: vi.fn(),
    snooze: vi.fn(),
    unsnooze: vi.fn(),
    getStats: vi.fn(() => ({ total: 10, unread: 3 }))
  }
}

describe('inbox-handlers', () => {
  let inbox: ReturnType<typeof makeMockInbox>
  const evt = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(handlers).forEach((k) => delete handlers[k])
    inbox = makeMockInbox()
    registerInboxHandlers(inbox as any)
  })

  // -----------------------------------------------------------------------
  // inbox:list
  // -----------------------------------------------------------------------
  describe('inbox:list', () => {
    it('returns items with no filters', () => {
      inbox.list.mockReturnValue([{ id: 'i1' }, { id: 'i2' }])
      const result = handlers['inbox:list'](evt, undefined)
      expect(result.data.items).toHaveLength(2)
      expect(result.data.hasMore).toBe(false)
    })

    it('returns hasMore when items exceed limit', () => {
      // Default limit is 50, return 51 items
      const items = Array.from({ length: 51 }, (_, i) => ({ id: `i${i}` }))
      inbox.list.mockReturnValue(items)
      const result = handlers['inbox:list'](evt, undefined)
      expect(result.data.items).toHaveLength(50)
      expect(result.data.hasMore).toBe(true)
    })

    it('uses search path when search filter provided', () => {
      inbox.search.mockReturnValue([{ id: 'i1' }])
      const result = handlers['inbox:list'](evt, { search: 'test query' })
      expect(inbox.search).toHaveBeenCalledWith('test query', 51, 0)
      expect(result.data.items).toHaveLength(1)
    })

    it('passes pluginId filter', () => {
      inbox.list.mockReturnValue([])
      handlers['inbox:list'](evt, { pluginId: 'gmail' })
      expect(inbox.list).toHaveBeenCalledWith(
        expect.objectContaining({ pluginId: 'gmail' })
      )
    })

    it('normalizes status to array', () => {
      inbox.list.mockReturnValue([])
      handlers['inbox:list'](evt, { status: 'unread' })
      expect(inbox.list).toHaveBeenCalledWith(
        expect.objectContaining({ status: ['unread'] })
      )
    })

    it('normalizes priority to array', () => {
      inbox.list.mockReturnValue([])
      handlers['inbox:list'](evt, { priority: 3 })
      expect(inbox.list).toHaveBeenCalledWith(
        expect.objectContaining({ priority: [3] })
      )
    })

    it('normalizes type to array', () => {
      inbox.list.mockReturnValue([])
      handlers['inbox:list'](evt, { type: 'email' })
      expect(inbox.list).toHaveBeenCalledWith(
        expect.objectContaining({ types: ['email'] })
      )
    })

    it('rejects invalid filters', () => {
      const result = handlers['inbox:list'](evt, 'not-an-object')
      expect(result).toEqual({ error: 'Invalid filters', code: 'VALIDATION' })
    })

    it('uses custom limit', () => {
      inbox.list.mockReturnValue([])
      handlers['inbox:list'](evt, { limit: 10 })
      expect(inbox.list).toHaveBeenCalledWith(
        expect.objectContaining({ limit: 11 })
      )
    })
  })

  // -----------------------------------------------------------------------
  // inbox:get
  // -----------------------------------------------------------------------
  describe('inbox:get', () => {
    it('returns inbox item', () => {
      inbox.get.mockReturnValue({ id: 'i1', title: 'Test' })
      const result = handlers['inbox:get'](evt, 'i1')
      expect(result).toEqual({ data: { id: 'i1', title: 'Test' } })
    })

    it('rejects non-string id', () => {
      const result = handlers['inbox:get'](evt, 42)
      expect(result).toEqual({ error: 'Invalid inbox item id', code: 'VALIDATION' })
    })

    it('returns not-found', () => {
      inbox.get.mockReturnValue(undefined)
      const result = handlers['inbox:get'](evt, 'missing')
      expect(result).toEqual({ error: 'Inbox item not found', code: 'NOT_FOUND' })
    })
  })

  // -----------------------------------------------------------------------
  // inbox:search
  // -----------------------------------------------------------------------
  describe('inbox:search', () => {
    it('searches with query', () => {
      inbox.search.mockReturnValue([{ id: 's1' }])
      const result = handlers['inbox:search'](evt, 'hello', undefined)
      expect(inbox.search).toHaveBeenCalledWith('hello', 51, 0)
      expect(result.data.items).toHaveLength(1)
    })

    it('rejects empty query', () => {
      const result = handlers['inbox:search'](evt, '', undefined)
      expect(result).toEqual({ error: 'Invalid search query', code: 'VALIDATION' })
    })

    it('uses custom limit from filters', () => {
      inbox.search.mockReturnValue([])
      handlers['inbox:search'](evt, 'test', { limit: 5 })
      expect(inbox.search).toHaveBeenCalledWith('test', 6, 0)
    })
  })

  // -----------------------------------------------------------------------
  // inbox:markRead / markUnread / archive
  // -----------------------------------------------------------------------
  describe('bulk actions', () => {
    it('inbox:markRead marks items as read', () => {
      const result = handlers['inbox:markRead'](evt, ['i1', 'i2'])
      expect(result).toEqual({ data: true })
      expect(inbox.markRead).toHaveBeenCalledWith(['i1', 'i2'])
    })

    it('inbox:markRead rejects empty array', () => {
      const result = handlers['inbox:markRead'](evt, [])
      expect(result).toEqual({ error: 'Invalid ids', code: 'VALIDATION' })
    })

    it('inbox:markRead rejects non-array', () => {
      const result = handlers['inbox:markRead'](evt, 'single-id')
      expect(result).toEqual({ error: 'Invalid ids', code: 'VALIDATION' })
    })

    it('inbox:markUnread marks items as unread', () => {
      const result = handlers['inbox:markUnread'](evt, ['i1'])
      expect(result).toEqual({ data: true })
      expect(inbox.markUnread).toHaveBeenCalledWith(['i1'])
    })

    it('inbox:markUnread rejects invalid input', () => {
      const result = handlers['inbox:markUnread'](evt, null)
      expect(result).toEqual({ error: 'Invalid ids', code: 'VALIDATION' })
    })

    it('inbox:archive archives items', () => {
      const result = handlers['inbox:archive'](evt, ['i1', 'i2'])
      expect(result).toEqual({ data: true })
      expect(inbox.archive).toHaveBeenCalledWith(['i1', 'i2'])
    })

    it('inbox:archive rejects empty array', () => {
      const result = handlers['inbox:archive'](evt, [])
      expect(result).toEqual({ error: 'Invalid ids', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // inbox:snooze / unsnooze
  // -----------------------------------------------------------------------
  describe('snooze', () => {
    it('inbox:snooze snoozes item', () => {
      inbox.snooze.mockReturnValue({ id: 'i1' })
      const result = handlers['inbox:snooze'](evt, 'i1', Date.now() + 3600000)
      expect(result).toEqual({ data: true })
    })

    it('inbox:snooze rejects invalid data', () => {
      const result = handlers['inbox:snooze'](evt, 123, 'not-a-number')
      expect(result).toEqual({ error: 'Invalid data', code: 'VALIDATION' })
    })

    it('inbox:snooze returns not-found', () => {
      inbox.snooze.mockReturnValue(undefined)
      const result = handlers['inbox:snooze'](evt, 'i-x', 123456)
      expect(result).toEqual({ error: 'Inbox item not found', code: 'NOT_FOUND' })
    })

    it('inbox:unsnooze unsnoozes item', () => {
      const result = handlers['inbox:unsnooze'](evt, 'i1')
      expect(result).toEqual({ data: true })
      expect(inbox.unsnooze).toHaveBeenCalledWith('i1')
    })

    it('inbox:unsnooze rejects invalid id', () => {
      const result = handlers['inbox:unsnooze'](evt, 999)
      expect(result).toEqual({ error: 'Invalid id', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // inbox:getStats
  // -----------------------------------------------------------------------
  it('inbox:getStats returns stats', () => {
    const result = handlers['inbox:getStats'](evt)
    expect(result).toEqual({ data: { total: 10, unread: 3 } })
  })

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------
  it('registers all expected channels', () => {
    const channels = Object.keys(handlers)
    expect(channels).toContain('inbox:list')
    expect(channels).toContain('inbox:get')
    expect(channels).toContain('inbox:search')
    expect(channels).toContain('inbox:markRead')
    expect(channels).toContain('inbox:markUnread')
    expect(channels).toContain('inbox:archive')
    expect(channels).toContain('inbox:snooze')
    expect(channels).toContain('inbox:unsnooze')
    expect(channels).toContain('inbox:getStats')
  })
})
