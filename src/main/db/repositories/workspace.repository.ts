import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache } from '../statement-cache'
import type { Workspace } from '../schema'

export class WorkspaceRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  list(): Workspace[] {
    return this.stmts
      .prepare('SELECT * FROM workspaces ORDER BY created_at ASC')
      .all() as Workspace[]
  }

  get(id: string): Workspace | undefined {
    return this.stmts
      .prepare('SELECT * FROM workspaces WHERE id = ?')
      .get(id) as Workspace | undefined
  }

  create(data: { name: string; settings?: string }): Workspace {
    const now = Date.now()
    const id = createId()
    const settings = data.settings ?? '{}'

    this.stmts
      .prepare(
        'INSERT INTO workspaces (id, name, settings, created_at, updated_at) VALUES (?, ?, ?, ?, ?)'
      )
      .run(id, data.name, settings, now, now)

    return { id, name: data.name, settings, createdAt: now, updatedAt: now }
  }

  update(
    id: string,
    data: { name?: string; settings?: string }
  ): Workspace | undefined {
    const existing = this.get(id)
    if (!existing) return undefined

    const now = Date.now()
    const name = data.name ?? existing.name
    const settings = data.settings ?? existing.settings

    this.stmts
      .prepare(
        'UPDATE workspaces SET name = ?, settings = ?, updated_at = ? WHERE id = ?'
      )
      .run(name, settings, now, id)

    return { ...existing, name, settings, updatedAt: now }
  }

  getDefault(): Workspace {
    const all = this.list()
    if (all.length > 0) return all[0]
    return this.create({ name: 'Default' })
  }
}
