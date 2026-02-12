import Database, { type Database as DatabaseType } from 'better-sqlite3'
import { app } from 'electron'
import { join } from 'path'
import { mkdirSync, existsSync } from 'fs'
import { runMigrations } from './migrate'

let db: DatabaseType | null = null

export function openDatabase(dbPath?: string): DatabaseType {
  if (db) return db

  const dataDir = dbPath
    ? dbPath
    : join(app.getPath('userData'), 'data')

  if (!existsSync(dataDir) && !dbPath) {
    mkdirSync(dataDir, { recursive: true })
  }

  const fullPath = dbPath
    ? dbPath
    : join(dataDir, 'devrig.db')

  db = new Database(fullPath)

  // Performance pragmas
  db.pragma('journal_mode = WAL')
  db.pragma('synchronous = NORMAL')
  db.pragma('mmap_size = 268435456')
  db.pragma('cache_size = -64000')
  db.pragma('temp_store = MEMORY')
  db.pragma('foreign_keys = ON')
  db.pragma('busy_timeout = 5000')

  runMigrations(db)

  return db
}

export function getDatabase(): DatabaseType {
  if (!db) {
    throw new Error('Database not initialized. Call openDatabase() first.')
  }
  return db
}

export function closeDatabase(): void {
  if (db) {
    db.pragma('wal_checkpoint(TRUNCATE)')
    db.close()
    db = null
  }
}
