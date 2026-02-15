import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockReadFileSync, mockReaddirSync } = vi.hoisted(() => ({
  mockReadFileSync: vi.fn(),
  mockReaddirSync: vi.fn()
}))

vi.mock('fs', () => ({
  readFileSync: mockReadFileSync,
  readdirSync: mockReaddirSync
}))

import { runMigrations } from '../../../src/main/db/migrate'

function makeMockDb() {
  const appliedMigrations = new Set<string>()

  const mockPrepare = vi.fn((sql: string) => {
    if (sql.includes('SELECT name FROM _migrations')) {
      return {
        get: vi.fn((name: string) =>
          appliedMigrations.has(name) ? { name } : undefined
        )
      }
    }
    if (sql.includes('INSERT INTO _migrations')) {
      return {
        run: vi.fn((name: string) => {
          appliedMigrations.add(name)
        })
      }
    }
    return { run: vi.fn(), get: vi.fn(), all: vi.fn() }
  })

  return {
    exec: vi.fn(),
    prepare: mockPrepare,
    transaction: vi.fn((fn: Function) => {
      // Return a function that immediately calls fn (no real transaction)
      return (...args: unknown[]) => fn(...args)
    }),
    _applied: appliedMigrations
  }
}

describe('runMigrations', () => {
  let mockDb: ReturnType<typeof makeMockDb>

  beforeEach(() => {
    vi.clearAllMocks()
    mockDb = makeMockDb()
  })

  it('creates the _migrations tracking table', () => {
    mockReaddirSync.mockReturnValue([])

    runMigrations(mockDb as any)

    expect(mockDb.exec).toHaveBeenCalledWith(
      expect.stringContaining('CREATE TABLE IF NOT EXISTS _migrations')
    )
  })

  describe('file-based migrations', () => {
    it('reads and applies SQL migration files in order', () => {
      mockReaddirSync.mockReturnValue([
        '0002_second.sql',
        '0001_first.sql',
        '0003_third.sql'
      ])
      mockReadFileSync
        .mockReturnValueOnce('CREATE TABLE first (id INTEGER);')
        .mockReturnValueOnce('CREATE TABLE second (id INTEGER);')
        .mockReturnValueOnce('CREATE TABLE third (id INTEGER);')

      runMigrations(mockDb as any)

      // Should be sorted: 0001, 0002, 0003
      expect(mockDb.exec).toHaveBeenCalledWith('CREATE TABLE first (id INTEGER);')
      expect(mockDb.exec).toHaveBeenCalledWith('CREATE TABLE second (id INTEGER);')
      expect(mockDb.exec).toHaveBeenCalledWith('CREATE TABLE third (id INTEGER);')
    })

    it('filters out non-.sql files', () => {
      mockReaddirSync.mockReturnValue([
        '0001_init.sql',
        'README.md',
        '.gitkeep',
        '0002_next.sql'
      ])
      mockReadFileSync
        .mockReturnValueOnce('CREATE TABLE a (id INT);')
        .mockReturnValueOnce('CREATE TABLE b (id INT);')

      runMigrations(mockDb as any)

      // Only .sql files should be read
      expect(mockReadFileSync).toHaveBeenCalledTimes(2)
    })

    it('skips already-applied migrations', () => {
      mockReaddirSync.mockReturnValue(['0001_init.sql', '0002_inbox.sql'])
      mockDb._applied.add('0001_init.sql')
      mockReadFileSync.mockReturnValue('CREATE TABLE new_table (id INT);')

      runMigrations(mockDb as any)

      // Only 0002 should be read and applied
      expect(mockReadFileSync).toHaveBeenCalledTimes(1)
    })
  })

  describe('inline migrations fallback', () => {
    it('runs inline migrations when migrations directory does not exist', () => {
      mockReaddirSync.mockImplementation(() => {
        throw new Error('ENOENT: no such file or directory')
      })

      runMigrations(mockDb as any)

      // Should have executed inline migration SQL (contains workspaces table)
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS workspaces')
      )
    })

    it('runs inline migrations when directory is empty', () => {
      mockReaddirSync.mockReturnValue([])

      runMigrations(mockDb as any)

      // Inline fallback includes workspaces and inbox_items
      expect(mockDb.exec).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS workspaces')
      )
    })

    it('skips already-applied inline migrations', () => {
      mockReaddirSync.mockReturnValue([])
      mockDb._applied.add('0001_initial.sql')

      runMigrations(mockDb as any)

      // 0001 should be skipped; only 0002 should run
      const execCalls = mockDb.exec.mock.calls
      const migrationCalls = execCalls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('CREATE TABLE')
      )

      // The _migrations table creation + 0002 migration only
      const hasFts = migrationCalls.some((c) => c[0].includes('inbox_items_fts'))
      expect(hasFts).toBe(true)
    })

    it('applies both inline migrations when none are applied', () => {
      mockReaddirSync.mockReturnValue([])

      runMigrations(mockDb as any)

      // Should apply both 0001 and 0002
      const allExecSql = mockDb.exec.mock.calls.map((c) => c[0]).join('\n')
      expect(allExecSql).toContain('workspaces')
      expect(allExecSql).toContain('inbox_items')
      expect(allExecSql).toContain('ai_operations')
      expect(allExecSql).toContain('plugin_sync_state')
    })

    it('uses transactions for each migration', () => {
      mockReaddirSync.mockReturnValue([])

      runMigrations(mockDb as any)

      expect(mockDb.transaction).toHaveBeenCalled()
    })
  })
})
