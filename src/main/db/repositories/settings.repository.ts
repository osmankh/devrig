import type { Database } from 'better-sqlite3'
import { StatementCache } from '../statement-cache'
import type { Setting } from '../schema'

export class SettingsRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  get(key: string): string | undefined {
    const row = this.stmts
      .prepare('SELECT * FROM settings WHERE key = ?')
      .get(key) as Setting | undefined
    return row?.value
  }

  set(key: string, value: string): void {
    const now = Date.now()
    this.stmts
      .prepare(
        `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`
      )
      .run(key, value, now)
  }

  getAll(): Setting[] {
    return this.stmts
      .prepare('SELECT * FROM settings ORDER BY key ASC')
      .all() as Setting[]
  }

  delete(key: string): boolean {
    const result = this.stmts
      .prepare('DELETE FROM settings WHERE key = ?')
      .run(key)
    return result.changes > 0
  }
}
