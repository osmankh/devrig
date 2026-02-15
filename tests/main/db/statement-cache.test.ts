import { describe, it, expect, vi, beforeEach } from 'vitest'
import { StatementCache } from '../../../src/main/db/statement-cache'

function makeMockDb() {
  let callCount = 0
  return {
    prepare: vi.fn((sql: string) => ({
      sql,
      _id: ++callCount,
      run: vi.fn(),
      get: vi.fn(),
      all: vi.fn()
    }))
  }
}

describe('StatementCache', () => {
  let mockDb: ReturnType<typeof makeMockDb>
  let cache: StatementCache

  beforeEach(() => {
    mockDb = makeMockDb()
    cache = new StatementCache(mockDb as any)
  })

  describe('prepare', () => {
    it('prepares and returns a statement for new SQL', () => {
      const stmt = cache.prepare('SELECT * FROM users')
      expect(stmt).toBeDefined()
      expect(stmt.sql).toBe('SELECT * FROM users')
      expect(mockDb.prepare).toHaveBeenCalledWith('SELECT * FROM users')
    })

    it('caches statements — same SQL returns same object', () => {
      const stmt1 = cache.prepare('SELECT * FROM users')
      const stmt2 = cache.prepare('SELECT * FROM users')

      expect(stmt1).toBe(stmt2)
      expect(mockDb.prepare).toHaveBeenCalledTimes(1)
    })

    it('creates different statements for different SQL', () => {
      const stmt1 = cache.prepare('SELECT * FROM users')
      const stmt2 = cache.prepare('SELECT * FROM posts')

      expect(stmt1).not.toBe(stmt2)
      expect(mockDb.prepare).toHaveBeenCalledTimes(2)
    })

    it('handles many cached statements', () => {
      const stmts = Array.from({ length: 100 }, (_, i) =>
        cache.prepare(`SELECT * FROM table_${i}`)
      )

      expect(mockDb.prepare).toHaveBeenCalledTimes(100)

      // All should be cached now — re-preparing should not call db.prepare again
      stmts.forEach((_, i) => {
        cache.prepare(`SELECT * FROM table_${i}`)
      })
      expect(mockDb.prepare).toHaveBeenCalledTimes(100)
    })

    it('handles SQL with parameters', () => {
      const stmt = cache.prepare('SELECT * FROM users WHERE id = ?')
      expect(stmt.sql).toBe('SELECT * FROM users WHERE id = ?')
    })
  })

  describe('invalidate', () => {
    it('clears all cached statements', () => {
      cache.prepare('SELECT 1')
      cache.prepare('SELECT 2')

      cache.invalidate()

      // After invalidation, same SQL should re-prepare
      cache.prepare('SELECT 1')
      expect(mockDb.prepare).toHaveBeenCalledTimes(3) // 2 initial + 1 after invalidation
    })

    it('is safe to call on empty cache', () => {
      expect(() => cache.invalidate()).not.toThrow()
    })

    it('is safe to call multiple times', () => {
      cache.prepare('SELECT 1')
      cache.invalidate()
      cache.invalidate()
      expect(() => cache.invalidate()).not.toThrow()
    })

    it('new prepare calls after invalidate get fresh statements', () => {
      const stmt1 = cache.prepare('SELECT 1')
      cache.invalidate()
      const stmt2 = cache.prepare('SELECT 1')

      // After invalidation, we get a new statement object (different _id)
      expect((stmt1 as any)._id).not.toBe((stmt2 as any)._id)
    })
  })
})
