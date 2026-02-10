import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache } from '../statement-cache'
import type { Secret } from '../schema'

interface SecretListItem {
  id: string
  name: string
  provider: string
  createdAt: number
  updatedAt: number
}

export class SecretsRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  getByName(name: string): Secret | undefined {
    return this.stmts
      .prepare('SELECT * FROM secrets WHERE name = ?')
      .get(name) as Secret | undefined
  }

  list(): SecretListItem[] {
    return this.stmts
      .prepare(
        'SELECT id, name, provider, created_at as createdAt, updated_at as updatedAt FROM secrets ORDER BY name ASC'
      )
      .all() as SecretListItem[]
  }

  create(data: {
    name: string
    encryptedValue: string
    provider?: string
  }): Secret {
    const now = Date.now()
    const id = createId()
    const provider = data.provider ?? 'safeStorage'

    this.stmts
      .prepare(
        `INSERT INTO secrets (id, name, encrypted_value, provider, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.name, data.encryptedValue, provider, now, now)

    return {
      id,
      name: data.name,
      encryptedValue: data.encryptedValue,
      provider,
      createdAt: now,
      updatedAt: now
    }
  }

  update(
    name: string,
    data: { encryptedValue: string }
  ): Secret | undefined {
    const existing = this.getByName(name)
    if (!existing) return undefined

    const now = Date.now()
    this.stmts
      .prepare(
        'UPDATE secrets SET encrypted_value = ?, updated_at = ? WHERE name = ?'
      )
      .run(data.encryptedValue, now, name)

    return { ...existing, encryptedValue: data.encryptedValue, updatedAt: now }
  }

  delete(name: string): boolean {
    const result = this.stmts
      .prepare('DELETE FROM secrets WHERE name = ?')
      .run(name)
    return result.changes > 0
  }
}
