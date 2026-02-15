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

/** Convert a snake_case row from SQLite into camelCase to match Drizzle inferred types. */
export function mapRow<T>(row: unknown): T {
  if (!row || typeof row !== 'object') return row as T
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(row as Record<string, unknown>)) {
    result[key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())] = value
  }
  return result as T
}

export function mapRows<T>(rows: unknown[]): T[] {
  return rows.map((r) => mapRow<T>(r))
}
