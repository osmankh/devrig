import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache } from '../statement-cache'
import type { Plugin } from '../schema'

export class PluginRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  list(): Plugin[] {
    return this.stmts
      .prepare('SELECT * FROM plugins ORDER BY name ASC')
      .all() as Plugin[]
  }

  listEnabled(): Plugin[] {
    return this.stmts
      .prepare(
        'SELECT * FROM plugins WHERE enabled = 1 ORDER BY name ASC'
      )
      .all() as Plugin[]
  }

  get(id: string): Plugin | undefined {
    return this.stmts
      .prepare('SELECT * FROM plugins WHERE id = ?')
      .get(id) as Plugin | undefined
  }

  getByName(name: string): Plugin | undefined {
    return this.stmts
      .prepare('SELECT * FROM plugins WHERE name = ?')
      .get(name) as Plugin | undefined
  }

  create(data: {
    name: string
    version: string
    manifest: string
    enabled?: boolean
  }): Plugin {
    const now = Date.now()
    const id = createId()
    const enabled = data.enabled !== false ? 1 : 0

    this.stmts
      .prepare(
        `INSERT INTO plugins (id, name, version, manifest, enabled, installed_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.name, data.version, data.manifest, enabled, now, now)

    return {
      id,
      name: data.name,
      version: data.version,
      manifest: data.manifest,
      enabled,
      installedAt: now,
      updatedAt: now
    }
  }

  update(
    id: string,
    data: { version?: string; manifest?: string; enabled?: boolean }
  ): Plugin | undefined {
    const existing = this.get(id)
    if (!existing) return undefined

    const now = Date.now()
    const version = data.version ?? existing.version
    const manifest = data.manifest ?? existing.manifest
    const enabled =
      data.enabled !== undefined ? (data.enabled ? 1 : 0) : existing.enabled

    this.stmts
      .prepare(
        `UPDATE plugins SET version = ?, manifest = ?, enabled = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(version, manifest, enabled, now, id)

    return { ...existing, version, manifest, enabled, updatedAt: now }
  }

  delete(id: string): boolean {
    const result = this.stmts
      .prepare('DELETE FROM plugins WHERE id = ?')
      .run(id)
    return result.changes > 0
  }
}
