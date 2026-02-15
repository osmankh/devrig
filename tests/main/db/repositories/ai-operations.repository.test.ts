import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedPlugin } from '../../../helpers/test-db'
import { AiOperationsRepository } from '../../../../src/main/db/repositories/ai-operations.repository'

describe('AiOperationsRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: AiOperationsRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new AiOperationsRepository(db)
    seedPlugin(db, 'plugin-1')
    seedPlugin(db, 'plugin-2')
  })
  afterEach(() => { db.close() })

  function makeOp(overrides: Record<string, unknown> = {}) {
    return {
      provider: 'claude',
      model: 'claude-sonnet-4-5-20250929',
      operation: 'classify',
      ...overrides
    } as Parameters<typeof repo.create>[0]
  }

  // ── create ──────────────────────────────────────────────
  describe('create()', () => {
    it('creates an operation with defaults', () => {
      const op = repo.create(makeOp())
      expect(op.id).toBeTypeOf('string')
      expect(op.provider).toBe('claude')
      expect(op.model).toBe('claude-sonnet-4-5-20250929')
      expect(op.operation).toBe('classify')
      expect(op.inputTokens).toBe(0)
      expect(op.outputTokens).toBe(0)
      expect(op.costUsd).toBe(0)
      expect(op.pluginId).toBeNull()
      expect(op.pipelineId).toBeNull()
      expect(op.inboxItemId).toBeNull()
      expect(op.executionId).toBeNull()
      expect(op.durationMs).toBeNull()
      expect(op.createdAt).toBeTypeOf('number')
    })

    it('creates with all optional fields', () => {
      const op = repo.create(makeOp({
        pluginId: 'plugin-1',
        pipelineId: 'pipe-1',
        inputTokens: 100,
        outputTokens: 200,
        costUsd: 0.005,
        durationMs: 350
      }))
      expect(op.pluginId).toBe('plugin-1')
      expect(op.pipelineId).toBe('pipe-1')
      expect(op.inputTokens).toBe(100)
      expect(op.outputTokens).toBe(200)
      expect(op.costUsd).toBe(0.005)
      expect(op.durationMs).toBe(350)
    })
  })

  // ── get ─────────────────────────────────────────────────
  describe('get()', () => {
    it('returns operation by id', () => {
      const created = repo.create(makeOp())
      const found = repo.get(created.id)
      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
    })

    it('returns undefined for unknown id', () => {
      expect(repo.get('nonexistent')).toBeUndefined()
    })
  })

  // ── list ────────────────────────────────────────────────
  describe('list()', () => {
    it('lists operations with default limit', () => {
      repo.create(makeOp())
      repo.create(makeOp())
      repo.create(makeOp())
      expect(repo.list()).toHaveLength(3)
    })

    it('respects limit and offset', () => {
      for (let i = 0; i < 5; i++) repo.create(makeOp())
      expect(repo.list(2)).toHaveLength(2)
      expect(repo.list(10, 3)).toHaveLength(2)
    })
  })

  // ── listByPlugin ────────────────────────────────────────
  describe('listByPlugin()', () => {
    it('filters by pluginId', () => {
      repo.create(makeOp({ pluginId: 'plugin-1' }))
      repo.create(makeOp({ pluginId: 'plugin-2' }))
      repo.create(makeOp({ pluginId: 'plugin-1' }))
      expect(repo.listByPlugin('plugin-1')).toHaveLength(2)
      expect(repo.listByPlugin('plugin-2')).toHaveLength(1)
    })
  })

  // ── listByInboxItem ─────────────────────────────────────
  describe('listByInboxItem()', () => {
    function seedInboxItem(id: string) {
      const now = Date.now()
      db.prepare(
        `INSERT OR IGNORE INTO inbox_items (id, plugin_id, external_id, type, title, status, priority, is_actionable, metadata, synced_at, created_at, updated_at)
         VALUES (?, 'plugin-1', ?, 'email', 'Test', 'unread', 0, 0, '{}', ?, ?, ?)`
      ).run(id, id, now, now, now)
    }

    it('filters by inboxItemId', () => {
      seedInboxItem('inbox-1')
      seedInboxItem('inbox-2')
      repo.create(makeOp({ inboxItemId: 'inbox-1' }))
      repo.create(makeOp({ inboxItemId: 'inbox-2' }))
      repo.create(makeOp({ inboxItemId: 'inbox-1' }))
      expect(repo.listByInboxItem('inbox-1')).toHaveLength(2)
    })
  })

  // ── log ─────────────────────────────────────────────────
  describe('log()', () => {
    it('logs an operation via NewAiOperation interface', () => {
      const op = repo.log({
        provider: 'openai',
        model: 'gpt-4',
        operation: 'summarize',
        pluginId: 'plugin-1',
        pipelineId: null,
        inboxItemId: null,
        executionId: null,
        inputTokens: 50,
        outputTokens: 100,
        costUsd: 0.01,
        durationMs: 200,
        createdAt: Date.now()
      })
      expect(op.provider).toBe('openai')
      expect(op.inputTokens).toBe(50)
    })
  })

  // ── getUsageSummary ─────────────────────────────────────
  describe('getUsageSummary()', () => {
    it('groups usage by provider', () => {
      repo.create(makeOp({ provider: 'claude', inputTokens: 100, outputTokens: 50, costUsd: 0.01 }))
      repo.create(makeOp({ provider: 'claude', inputTokens: 200, outputTokens: 100, costUsd: 0.02 }))
      repo.create(makeOp({ provider: 'openai', inputTokens: 300, outputTokens: 150, costUsd: 0.05 }))

      const summary = repo.getUsageSummary()
      expect(summary).toHaveLength(2)

      const openai = summary.find((s) => s.provider === 'openai')!
      expect(openai.totalInputTokens).toBe(300)
      expect(openai.totalOutputTokens).toBe(150)
      expect(openai.totalCostUsd).toBeCloseTo(0.05)
      expect(openai.operationCount).toBe(1)

      const claude = summary.find((s) => s.provider === 'claude')!
      expect(claude.totalInputTokens).toBe(300)
      expect(claude.operationCount).toBe(2)
    })

    it('filters by sinceMs', () => {
      const past = Date.now() - 100_000
      // Create an op, then manipulate its created_at to be in the past
      const op = repo.create(makeOp({ provider: 'claude', costUsd: 0.01 }))
      db.prepare('UPDATE ai_operations SET created_at = ? WHERE id = ?').run(past, op.id)

      repo.create(makeOp({ provider: 'claude', costUsd: 0.02 }))

      const allSummary = repo.getUsageSummary(0)
      expect(allSummary[0].operationCount).toBe(2)

      const recentSummary = repo.getUsageSummary(Date.now() - 1000)
      expect(recentSummary[0].operationCount).toBe(1)
    })
  })

  // ── getPluginCost ───────────────────────────────────────
  describe('getPluginCost()', () => {
    it('returns total cost for a plugin', () => {
      repo.create(makeOp({ pluginId: 'plugin-1', costUsd: 0.01 }))
      repo.create(makeOp({ pluginId: 'plugin-1', costUsd: 0.02 }))
      repo.create(makeOp({ pluginId: 'plugin-2', costUsd: 0.05 }))
      expect(repo.getPluginCost('plugin-1')).toBeCloseTo(0.03)
      expect(repo.getPluginCost('plugin-2')).toBeCloseTo(0.05)
    })

    it('returns 0 for unknown plugin', () => {
      expect(repo.getPluginCost('nonexistent')).toBe(0)
    })
  })

  // ── getOperationCount ───────────────────────────────────
  describe('getOperationCount()', () => {
    it('counts operations since a timestamp', () => {
      repo.create(makeOp())
      repo.create(makeOp())
      const count = repo.getOperationCount(0)
      expect(count).toBe(2)
    })

    it('excludes old operations', () => {
      const op = repo.create(makeOp())
      db.prepare('UPDATE ai_operations SET created_at = ? WHERE id = ?').run(1000, op.id)
      repo.create(makeOp())
      const count = repo.getOperationCount(Date.now() - 1000)
      expect(count).toBe(1)
    })
  })

  // ── deleteOlderThan ─────────────────────────────────────
  describe('deleteOlderThan()', () => {
    it('deletes old operations', () => {
      const op1 = repo.create(makeOp())
      const op2 = repo.create(makeOp())
      db.prepare('UPDATE ai_operations SET created_at = ? WHERE id = ?').run(1000, op1.id)
      db.prepare('UPDATE ai_operations SET created_at = ? WHERE id = ?').run(2000, op2.id)
      repo.create(makeOp()) // recent

      const deleted = repo.deleteOlderThan(3000)
      expect(deleted).toBe(2)
      expect(repo.list()).toHaveLength(1)
    })

    it('returns 0 when nothing to delete', () => {
      repo.create(makeOp())
      expect(repo.deleteOlderThan(0)).toBe(0)
    })
  })

  // ── getUsage ────────────────────────────────────────────
  describe('getUsage()', () => {
    it('returns total usage without filters', () => {
      repo.create(makeOp({ inputTokens: 100, outputTokens: 50, costUsd: 0.01 }))
      repo.create(makeOp({ inputTokens: 200, outputTokens: 100, costUsd: 0.02 }))
      const usage = repo.getUsage()
      expect(usage.totalInputTokens).toBe(300)
      expect(usage.totalOutputTokens).toBe(150)
      expect(usage.totalCostUsd).toBeCloseTo(0.03)
      expect(usage.operationCount).toBe(2)
    })

    it('filters by provider', () => {
      repo.create(makeOp({ provider: 'claude', inputTokens: 100 }))
      repo.create(makeOp({ provider: 'openai', inputTokens: 200 }))
      const usage = repo.getUsage({ provider: 'claude' })
      expect(usage.totalInputTokens).toBe(100)
      expect(usage.operationCount).toBe(1)
    })

    it('filters by pluginId', () => {
      repo.create(makeOp({ pluginId: 'plugin-1', costUsd: 0.01 }))
      repo.create(makeOp({ pluginId: 'plugin-2', costUsd: 0.05 }))
      const usage = repo.getUsage({ pluginId: 'plugin-1' })
      expect(usage.totalCostUsd).toBeCloseTo(0.01)
    })

    it('filters by date range', () => {
      const op = repo.create(makeOp({ inputTokens: 100 }))
      db.prepare('UPDATE ai_operations SET created_at = ? WHERE id = ?').run(5000, op.id)
      repo.create(makeOp({ inputTokens: 200 }))

      const usage = repo.getUsage({ dateFrom: Date.now() - 1000 })
      expect(usage.totalInputTokens).toBe(200)
      expect(usage.operationCount).toBe(1)
    })
  })

  // ── getUsageByProvider ──────────────────────────────────
  describe('getUsageByProvider()', () => {
    it('groups usage by provider in date range', () => {
      repo.create(makeOp({ provider: 'claude', inputTokens: 100, costUsd: 0.01 }))
      repo.create(makeOp({ provider: 'claude', inputTokens: 200, costUsd: 0.02 }))
      repo.create(makeOp({ provider: 'openai', inputTokens: 300, costUsd: 0.05 }))

      const result = repo.getUsageByProvider(0, Date.now() + 1000)
      expect(result).toHaveLength(2)

      const claude = result.find((r) => r.group === 'claude')!
      expect(claude.totalInputTokens).toBe(300)
      expect(claude.operationCount).toBe(2)

      const openai = result.find((r) => r.group === 'openai')!
      expect(openai.totalInputTokens).toBe(300)
      expect(openai.operationCount).toBe(1)
    })
  })

  // ── getUsageByPlugin ────────────────────────────────────
  describe('getUsageByPlugin()', () => {
    it('groups usage by plugin in date range', () => {
      repo.create(makeOp({ pluginId: 'plugin-1', costUsd: 0.01 }))
      repo.create(makeOp({ pluginId: 'plugin-1', costUsd: 0.02 }))
      repo.create(makeOp({ pluginId: 'plugin-2', costUsd: 0.05 }))
      repo.create(makeOp({ costUsd: 0.001 })) // system (no plugin)

      const result = repo.getUsageByPlugin(0, Date.now() + 1000)
      expect(result.length).toBeGreaterThanOrEqual(2)

      const p1 = result.find((r) => r.group === 'plugin-1')!
      expect(p1.totalCostUsd).toBeCloseTo(0.03)
      expect(p1.operationCount).toBe(2)

      const sys = result.find((r) => r.group === 'system')!
      expect(sys.operationCount).toBe(1)
    })
  })

  // ── getDailyUsage ───────────────────────────────────────
  describe('getDailyUsage()', () => {
    it('returns usage for a specific day', () => {
      // Create ops "today"
      repo.create(makeOp({ inputTokens: 100, costUsd: 0.01 }))
      repo.create(makeOp({ inputTokens: 200, costUsd: 0.02 }))

      const usage = repo.getDailyUsage(Date.now())
      expect(usage.totalInputTokens).toBe(300)
      expect(usage.operationCount).toBe(2)
    })

    it('returns zeros for a day with no ops', () => {
      const farPast = new Date('2020-01-01').getTime()
      const usage = repo.getDailyUsage(farPast)
      expect(usage.operationCount).toBe(0)
      expect(usage.totalInputTokens).toBe(0)
    })
  })

  // ── listFiltered ────────────────────────────────────────
  describe('listFiltered()', () => {
    it('filters by provider', () => {
      repo.create(makeOp({ provider: 'claude' }))
      repo.create(makeOp({ provider: 'openai' }))
      const result = repo.listFiltered({ provider: 'claude' })
      expect(result).toHaveLength(1)
      expect(result[0].provider).toBe('claude')
    })

    it('filters by model', () => {
      repo.create(makeOp({ model: 'claude-sonnet-4-5-20250929' }))
      repo.create(makeOp({ model: 'gpt-4' }))
      expect(repo.listFiltered({ model: 'gpt-4' })).toHaveLength(1)
    })

    it('filters by pluginId', () => {
      repo.create(makeOp({ pluginId: 'plugin-1' }))
      repo.create(makeOp({ pluginId: 'plugin-2' }))
      expect(repo.listFiltered({ pluginId: 'plugin-1' })).toHaveLength(1)
    })

    it('respects limit and offset', () => {
      for (let i = 0; i < 5; i++) repo.create(makeOp())
      expect(repo.listFiltered({ limit: 2 })).toHaveLength(2)
      expect(repo.listFiltered({ limit: 10, offset: 3 })).toHaveLength(2)
    })

    it('combines multiple filters', () => {
      repo.create(makeOp({ provider: 'claude', model: 'claude-sonnet-4-5-20250929', pluginId: 'plugin-1' }))
      repo.create(makeOp({ provider: 'claude', model: 'claude-haiku-4-5-20251001', pluginId: 'plugin-1' }))
      repo.create(makeOp({ provider: 'openai', model: 'gpt-4', pluginId: 'plugin-1' }))
      const result = repo.listFiltered({ provider: 'claude', pluginId: 'plugin-1' })
      expect(result).toHaveLength(2)
    })
  })
})
