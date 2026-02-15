import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Use vi.hoisted so mock variables are available inside vi.mock factories
// even after vi.resetModules()
// ---------------------------------------------------------------------------
const { mockPragma, mockClose, mockDb, mockRunMigrations, MockDatabase } = vi.hoisted(() => {
  const mockPragma = vi.fn()
  const mockClose = vi.fn()
  const mockDb = { pragma: mockPragma, close: mockClose }
  const mockRunMigrations = vi.fn()
  // Use a regular function (not arrow) so it can be used with `new`
  const MockDatabase = vi.fn(function (this: any) {
    Object.assign(this, mockDb)
    return mockDb
  })
  return { mockPragma, mockClose, mockDb, mockRunMigrations, MockDatabase }
})

vi.mock('better-sqlite3', () => ({
  default: MockDatabase
}))

vi.mock('electron', () => ({
  app: { getPath: vi.fn(() => '/tmp/test-userData') }
}))

vi.mock('fs', () => ({
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn()
}))

vi.mock('../../../src/main/db/migrate', () => ({
  runMigrations: mockRunMigrations
}))

describe('connection', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.resetModules()
  })

  it('openDatabase creates a database with default path', async () => {
    const { openDatabase } = await import('../../../src/main/db/connection')

    const db = openDatabase()
    expect(db).toBe(mockDb)

    // Verify pragmas were set
    expect(mockPragma).toHaveBeenCalledWith('journal_mode = WAL')
    expect(mockPragma).toHaveBeenCalledWith('synchronous = NORMAL')
    expect(mockPragma).toHaveBeenCalledWith('mmap_size = 268435456')
    expect(mockPragma).toHaveBeenCalledWith('cache_size = -64000')
    expect(mockPragma).toHaveBeenCalledWith('temp_store = MEMORY')
    expect(mockPragma).toHaveBeenCalledWith('foreign_keys = ON')
    expect(mockPragma).toHaveBeenCalledWith('busy_timeout = 5000')

    // Verify migrations ran
    expect(mockRunMigrations).toHaveBeenCalledWith(mockDb)
  })

  it('openDatabase creates data directory if it does not exist', async () => {
    const { openDatabase } = await import('../../../src/main/db/connection')
    const { existsSync, mkdirSync } = await import('fs')
    vi.mocked(existsSync).mockReturnValue(false)

    openDatabase()

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.stringContaining('data'),
      { recursive: true }
    )
  })

  it('openDatabase uses custom path when provided', async () => {
    const { openDatabase } = await import('../../../src/main/db/connection')

    openDatabase('/custom/path.db')

    expect(MockDatabase).toHaveBeenCalledWith('/custom/path.db')
  })

  it('openDatabase returns same instance on second call', async () => {
    const { openDatabase } = await import('../../../src/main/db/connection')

    const db1 = openDatabase()
    const db2 = openDatabase()
    expect(db1).toBe(db2)
  })

  it('getDatabase throws when not initialized', async () => {
    const { getDatabase } = await import('../../../src/main/db/connection')

    expect(() => getDatabase()).toThrow('Database not initialized')
  })

  it('getDatabase returns db after openDatabase', async () => {
    const { openDatabase, getDatabase } = await import('../../../src/main/db/connection')

    openDatabase()
    const db = getDatabase()
    expect(db).toBe(mockDb)
  })

  it('closeDatabase closes and resets the db', async () => {
    const { openDatabase, closeDatabase, getDatabase } = await import('../../../src/main/db/connection')

    openDatabase()
    closeDatabase()

    expect(mockPragma).toHaveBeenCalledWith('wal_checkpoint(TRUNCATE)')
    expect(mockClose).toHaveBeenCalled()

    // After close, getDatabase should throw
    expect(() => getDatabase()).toThrow('Database not initialized')
  })

  it('closeDatabase is safe to call when not open', async () => {
    const { closeDatabase } = await import('../../../src/main/db/connection')

    // Should not throw
    expect(() => closeDatabase()).not.toThrow()
    expect(mockClose).not.toHaveBeenCalled()
  })
})
