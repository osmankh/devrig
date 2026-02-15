import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedPlugin } from '../../../helpers/test-db'
import { InboxRepository } from '../../../../src/main/db/repositories/inbox.repository'

describe('InboxRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: InboxRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new InboxRepository(db)
    seedPlugin(db, 'plugin-1')
    seedPlugin(db, 'plugin-2')
  })
  afterEach(() => { db.close() })

  function makeItem(overrides: Record<string, unknown> = {}) {
    return {
      pluginId: 'plugin-1',
      externalId: `ext-${Math.random().toString(36).slice(2, 8)}`,
      type: 'email',
      title: 'Test Item',
      ...overrides
    } as Parameters<typeof repo.create>[0]
  }

  // ── create ──────────────────────────────────────────────
  describe('create()', () => {
    it('creates an inbox item with defaults', () => {
      const item = repo.create(makeItem())
      expect(item.id).toBeTypeOf('string')
      expect(item.pluginId).toBe('plugin-1')
      expect(item.status).toBe('unread')
      expect(item.priority).toBe(0)
      expect(item.isActionable).toBe(0)
      expect(item.aiClassification).toBeNull()
      expect(item.aiSummary).toBeNull()
      expect(item.aiDraft).toBeNull()
      expect(item.snoozedUntil).toBeNull()
      expect(item.metadata).toBe('{}')
    })

    it('creates with all optional fields', () => {
      const item = repo.create(makeItem({
        body: 'body text',
        preview: 'preview text',
        sourceUrl: 'https://example.com',
        priority: 3,
        status: 'read',
        metadata: '{"key":"val"}',
        isActionable: true,
        externalCreatedAt: 1000
      }))
      expect(item.body).toBe('body text')
      expect(item.preview).toBe('preview text')
      expect(item.sourceUrl).toBe('https://example.com')
      expect(item.priority).toBe(3)
      expect(item.status).toBe('read')
      expect(item.isActionable).toBe(1)
      expect(item.externalCreatedAt).toBe(1000)
    })
  })

  // ── get ─────────────────────────────────────────────────
  describe('get()', () => {
    it('returns item by id', () => {
      const created = repo.create(makeItem())
      const found = repo.get(created.id)
      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
    })

    it('returns undefined for unknown id', () => {
      expect(repo.get('nonexistent')).toBeUndefined()
    })
  })

  // ── getByExternalId ─────────────────────────────────────
  describe('getByExternalId()', () => {
    it('finds item by plugin + external id', () => {
      repo.create(makeItem({ externalId: 'ext-123' }))
      const found = repo.getByExternalId('plugin-1', 'ext-123')
      expect(found).toBeDefined()
      expect(found!.externalId).toBe('ext-123')
    })

    it('returns undefined for wrong plugin', () => {
      repo.create(makeItem({ externalId: 'ext-123' }))
      expect(repo.getByExternalId('plugin-2', 'ext-123')).toBeUndefined()
    })
  })

  // ── list ────────────────────────────────────────────────
  describe('list()', () => {
    it('lists all items with default limit', () => {
      for (let i = 0; i < 3; i++) repo.create(makeItem())
      expect(repo.list()).toHaveLength(3)
    })

    it('filters by pluginId', () => {
      repo.create(makeItem({ pluginId: 'plugin-1' }))
      repo.create(makeItem({ pluginId: 'plugin-2' }))
      expect(repo.list({ pluginId: 'plugin-1' })).toHaveLength(1)
    })

    it('filters by types', () => {
      repo.create(makeItem({ type: 'email' }))
      repo.create(makeItem({ type: 'pr' }))
      repo.create(makeItem({ type: 'issue' }))
      const result = repo.list({ types: ['email', 'pr'] })
      expect(result).toHaveLength(2)
    })

    it('filters by status', () => {
      repo.create(makeItem({ status: 'unread' }))
      repo.create(makeItem({ status: 'read' }))
      repo.create(makeItem({ status: 'archived' }))
      expect(repo.list({ status: ['unread', 'read'] })).toHaveLength(2)
    })

    it('filters by priority', () => {
      repo.create(makeItem({ priority: 1 }))
      repo.create(makeItem({ priority: 3 }))
      repo.create(makeItem({ priority: 5 }))
      expect(repo.list({ priority: [3, 5] })).toHaveLength(2)
    })

    it('filters by isActionable', () => {
      repo.create(makeItem({ isActionable: true }))
      repo.create(makeItem({ isActionable: false }))
      expect(repo.list({ isActionable: true })).toHaveLength(1)
    })

    it('respects limit and offset', () => {
      for (let i = 0; i < 10; i++) repo.create(makeItem())
      expect(repo.list({ limit: 3 })).toHaveLength(3)
      expect(repo.list({ limit: 5, offset: 8 })).toHaveLength(2)
    })

    it('orders by priority', () => {
      repo.create(makeItem({ title: 'Low', priority: 1 }))
      repo.create(makeItem({ title: 'High', priority: 5 }))
      const results = repo.list({ orderBy: 'priority' })
      expect(results[0].priority).toBe(5)
      expect(results[1].priority).toBe(1)
    })
  })

  // ── search (FTS5) ──────────────────────────────────────
  describe('search()', () => {
    it('finds items by FTS match on title', () => {
      repo.create(makeItem({ title: 'Important deployment notice' }))
      repo.create(makeItem({ title: 'Weekly standup notes' }))
      const results = repo.search('deployment')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('Important deployment notice')
    })

    it('finds items by FTS match on body', () => {
      repo.create(makeItem({ title: 'PR', body: 'Fixed critical memory leak in parser' }))
      repo.create(makeItem({ title: 'Issue', body: 'Add dark mode support' }))
      const results = repo.search('memory')
      expect(results).toHaveLength(1)
      expect(results[0].title).toBe('PR')
    })

    it('returns empty for no matches', () => {
      repo.create(makeItem({ title: 'Hello world' }))
      expect(repo.search('zzzznonexistent')).toHaveLength(0)
    })

    it('respects limit', () => {
      for (let i = 0; i < 5; i++) {
        repo.create(makeItem({ title: `Deploy item ${i}` }))
      }
      expect(repo.search('Deploy', 2)).toHaveLength(2)
    })
  })

  // ── count ───────────────────────────────────────────────
  describe('count()', () => {
    it('counts all items', () => {
      repo.create(makeItem())
      repo.create(makeItem())
      expect(repo.count()).toBe(2)
    })

    it('counts with filters', () => {
      repo.create(makeItem({ pluginId: 'plugin-1', status: 'unread' }))
      repo.create(makeItem({ pluginId: 'plugin-1', status: 'read' }))
      repo.create(makeItem({ pluginId: 'plugin-2', status: 'unread' }))
      expect(repo.count({ pluginId: 'plugin-1' })).toBe(2)
      expect(repo.count({ status: ['unread'] })).toBe(2)
      expect(repo.count({ pluginId: 'plugin-1', status: ['unread'] })).toBe(1)
    })
  })

  // ── update ──────────────────────────────────────────────
  describe('update()', () => {
    it('updates basic fields', () => {
      const item = repo.create(makeItem())
      const updated = repo.update(item.id, {
        title: 'Updated Title',
        priority: 5,
        status: 'read'
      })
      expect(updated).toBeDefined()
      expect(updated!.title).toBe('Updated Title')
      expect(updated!.priority).toBe(5)
      expect(updated!.status).toBe('read')
    })

    it('sets and clears AI fields', () => {
      const item = repo.create(makeItem())
      const updated = repo.update(item.id, {
        aiClassification: 'important',
        aiSummary: 'A summary',
        aiDraft: 'Draft reply'
      })
      expect(updated!.aiClassification).toBe('important')
      expect(updated!.aiSummary).toBe('A summary')

      const cleared = repo.update(item.id, { aiClassification: null })
      expect(cleared!.aiClassification).toBeNull()
      expect(cleared!.aiSummary).toBe('A summary') // preserved
    })

    it('updates snoozedUntil', () => {
      const item = repo.create(makeItem())
      const updated = repo.update(item.id, { snoozedUntil: 9999999 })
      expect(updated!.snoozedUntil).toBe(9999999)
    })

    it('returns undefined for unknown id', () => {
      expect(repo.update('nonexistent', { title: 'x' })).toBeUndefined()
    })
  })

  // ── upsert ──────────────────────────────────────────────
  describe('upsert()', () => {
    it('creates when item does not exist', () => {
      const result = repo.upsert(makeItem({ externalId: 'new-1', title: 'New' }))
      expect(result.created).toBe(true)
      expect(result.item.title).toBe('New')
    })

    it('updates when item already exists', () => {
      repo.create(makeItem({ externalId: 'dup-1', title: 'Original' }))
      const result = repo.upsert(makeItem({ externalId: 'dup-1', title: 'Updated' }))
      expect(result.created).toBe(false)
      expect(result.item.title).toBe('Updated')
    })
  })

  // ── batchUpsert ─────────────────────────────────────────
  describe('batchUpsert()', () => {
    it('batch creates and updates', () => {
      repo.create(makeItem({ externalId: 'existing-1', title: 'Old' }))
      const result = repo.batchUpsert([
        makeItem({ externalId: 'existing-1', title: 'Updated' }),
        makeItem({ externalId: 'brand-new', title: 'New' })
      ])
      expect(result.created).toBe(1)
      expect(result.updated).toBe(1)
    })
  })

  // ── markRead / markUnread ───────────────────────────────
  describe('markRead() / markUnread()', () => {
    it('marks unread items as read', () => {
      const a = repo.create(makeItem())
      const b = repo.create(makeItem())
      repo.markRead([a.id, b.id])
      expect(repo.get(a.id)!.status).toBe('read')
      expect(repo.get(b.id)!.status).toBe('read')
    })

    it('does not change already read items', () => {
      const item = repo.create(makeItem({ status: 'read' }))
      repo.markRead([item.id])
      expect(repo.get(item.id)!.status).toBe('read')
    })

    it('does nothing for empty array', () => {
      repo.markRead([]) // should not throw
    })

    it('marks items as unread', () => {
      const item = repo.create(makeItem({ status: 'read' }))
      repo.markUnread([item.id])
      expect(repo.get(item.id)!.status).toBe('unread')
    })

    it('does nothing for empty array on markUnread', () => {
      repo.markUnread([]) // should not throw
    })
  })

  // ── archive ─────────────────────────────────────────────
  describe('archive()', () => {
    it('archives items', () => {
      const a = repo.create(makeItem())
      const b = repo.create(makeItem())
      repo.archive([a.id, b.id])
      expect(repo.get(a.id)!.status).toBe('archived')
      expect(repo.get(b.id)!.status).toBe('archived')
    })

    it('does nothing for empty array', () => {
      repo.archive([]) // should not throw
    })
  })

  // ── snooze / unsnooze / unsnoozeExpired ─────────────────
  describe('snooze()', () => {
    it('snoozes an item until a timestamp', () => {
      const item = repo.create(makeItem())
      const snoozed = repo.snooze(item.id, 9999999)
      expect(snoozed).toBeDefined()
      expect(snoozed!.status).toBe('snoozed')
      expect(snoozed!.snoozedUntil).toBe(9999999)
    })
  })

  describe('unsnooze()', () => {
    it('unsnoozes an item back to unread', () => {
      const item = repo.create(makeItem())
      repo.snooze(item.id, 9999999)
      repo.unsnooze(item.id)
      const found = repo.get(item.id)
      expect(found!.status).toBe('unread')
      expect(found!.snoozedUntil).toBeNull()
    })
  })

  describe('unsnoozeExpired()', () => {
    it('unsnoozes items past their snooze time', () => {
      const past = repo.create(makeItem())
      const future = repo.create(makeItem())
      repo.snooze(past.id, 1) // far in the past
      repo.snooze(future.id, Date.now() + 60_000) // future

      const count = repo.unsnoozeExpired()
      expect(count).toBe(1)
      expect(repo.get(past.id)!.status).toBe('unread')
      expect(repo.get(future.id)!.status).toBe('snoozed')
    })
  })

  // ── delete / deleteByPlugin ─────────────────────────────
  describe('delete()', () => {
    it('deletes an item', () => {
      const item = repo.create(makeItem())
      expect(repo.delete(item.id)).toBe(true)
      expect(repo.get(item.id)).toBeUndefined()
    })

    it('returns false for unknown id', () => {
      expect(repo.delete('nonexistent')).toBe(false)
    })
  })

  describe('deleteByPlugin()', () => {
    it('deletes all items for a plugin', () => {
      repo.create(makeItem({ pluginId: 'plugin-1' }))
      repo.create(makeItem({ pluginId: 'plugin-1' }))
      repo.create(makeItem({ pluginId: 'plugin-2' }))
      const count = repo.deleteByPlugin('plugin-1')
      expect(count).toBe(2)
      expect(repo.count({ pluginId: 'plugin-1' })).toBe(0)
      expect(repo.count({ pluginId: 'plugin-2' })).toBe(1)
    })
  })

  // ── getStats ────────────────────────────────────────────
  describe('getStats()', () => {
    it('returns correct stats', () => {
      repo.create(makeItem({ pluginId: 'plugin-1', status: 'unread' }))
      repo.create(makeItem({ pluginId: 'plugin-1', status: 'unread', isActionable: true }))
      repo.create(makeItem({ pluginId: 'plugin-2', status: 'unread' }))
      repo.create(makeItem({ pluginId: 'plugin-2', status: 'read' }))

      const stats = repo.getStats()
      expect(stats.unreadCount).toBe(3)
      expect(stats.actionableCount).toBe(1)
      expect(stats.pluginCounts['plugin-1']).toBe(2)
      expect(stats.pluginCounts['plugin-2']).toBe(1)
    })

    it('returns zeros when empty', () => {
      const stats = repo.getStats()
      expect(stats.unreadCount).toBe(0)
      expect(stats.actionableCount).toBe(0)
      expect(Object.keys(stats.pluginCounts)).toHaveLength(0)
    })
  })

  // ── updateAiFields ──────────────────────────────────────
  describe('updateAiFields()', () => {
    it('sets AI classification, summary, and draft', () => {
      const item = repo.create(makeItem())
      repo.updateAiFields(item.id, {
        aiClassification: 'urgent',
        aiSummary: 'This is a summary',
        aiDraft: 'Draft response'
      })
      const found = repo.get(item.id)
      expect(found!.aiClassification).toBe('urgent')
      expect(found!.aiSummary).toBe('This is a summary')
      expect(found!.aiDraft).toBe('Draft response')
    })

    it('updates only specified fields', () => {
      const item = repo.create(makeItem())
      repo.updateAiFields(item.id, { aiClassification: 'low' })
      const found = repo.get(item.id)
      expect(found!.aiClassification).toBe('low')
      expect(found!.aiSummary).toBeNull()
    })

    it('does nothing for unknown id', () => {
      repo.updateAiFields('nonexistent', { aiClassification: 'x' }) // should not throw
    })
  })
})
