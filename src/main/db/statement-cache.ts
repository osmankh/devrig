import type { Statement, Database } from 'better-sqlite3'

export class StatementCache {
  private cache = new Map<string, Statement>()

  constructor(private db: Database) {}

  prepare(sql: string): Statement {
    let stmt = this.cache.get(sql)
    if (!stmt) {
      stmt = this.db.prepare(sql)
      this.cache.set(sql, stmt)
    }
    return stmt
  }

  invalidate(): void {
    this.cache.clear()
  }
}
