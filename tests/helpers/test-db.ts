/**
 * Shared test helper — creates an in-memory SQLite database
 * with all migrations applied.  Use in repository / handler tests
 * to get a fully-migrated DB without touching disk.
 *
 * Usage:
 *   import { createTestDb } from '../helpers/test-db'
 *   let db: ReturnType<typeof createTestDb>
 *   beforeEach(() => { db = createTestDb() })
 *   afterEach(() => { db.close() })
 */

import Database from 'better-sqlite3'
import { runMigrations } from '../../src/main/db/migrate'

export function createTestDb() {
  const db = new Database(':memory:')
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')
  runMigrations(db)
  return db
}

/** Insert a minimal plugin row required by FK constraints for inbox_items etc. */
export function seedPlugin(db: ReturnType<typeof Database>, id = 'test-plugin') {
  const now = Date.now()
  db.prepare(
    'INSERT OR IGNORE INTO plugins (id, name, version, manifest, enabled, installed_at, updated_at) VALUES (?, ?, ?, ?, 1, ?, ?)'
  ).run(id, `Plugin ${id}`, '1.0.0', JSON.stringify({ id, name: `Plugin ${id}`, version: '1.0.0' }), now, now)
  return id
}

/** Insert a minimal workspace row. */
export function seedWorkspace(db: ReturnType<typeof Database>, id = 'test-ws') {
  const now = Date.now()
  db.prepare(
    "INSERT OR IGNORE INTO workspaces (id, name, settings, created_at, updated_at) VALUES (?, 'Test WS', '{}', ?, ?)"
  ).run(id, now, now)
  return id
}

/** Insert a minimal workflow row (requires workspace). */
export function seedWorkflow(db: ReturnType<typeof Database>, id = 'test-wf', workspaceId = 'test-ws') {
  seedWorkspace(db, workspaceId)
  const now = Date.now()
  db.prepare(
    "INSERT OR IGNORE INTO workflows (id, workspace_id, name, description, status, trigger_config, created_at, updated_at) VALUES (?, ?, 'Test Flow', '', 'draft', '{}', ?, ?)"
  ).run(id, workspaceId, now, now)
  return id
}
