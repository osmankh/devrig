import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache, mapRow, mapRows } from '../statement-cache'
import type { InboxItem } from '../schema'

export interface InboxQuery {
  pluginId?: string
  types?: string[]
  status?: string[]
  priority?: number[]
  isActionable?: boolean
  search?: string
  limit?: number
  offset?: number
  orderBy?: 'created_at' | 'updated_at' | 'priority'
}

export interface InboxFilters {
  pluginId?: string
  status?: string
  priority?: number
  type?: string
  isActionable?: boolean
  search?: string
  limit?: number
  afterId?: string
}

export interface InboxStats {
  unreadCount: number
  actionableCount: number
  pluginCounts: Record<string, number>
}

export class InboxRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  get(id: string): InboxItem | undefined {
    const row = this.stmts
      .prepare('SELECT * FROM inbox_items WHERE id = ?')
      .get(id)
    return row ? mapRow<InboxItem>(row) : undefined
  }

  getByExternalId(pluginId: string, externalId: string): InboxItem | undefined {
    const row = this.stmts
      .prepare('SELECT * FROM inbox_items WHERE plugin_id = ? AND external_id = ?')
      .get(pluginId, externalId)
    return row ? mapRow<InboxItem>(row) : undefined
  }

  list(query: InboxQuery = {}): InboxItem[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (query.pluginId) {
      conditions.push('plugin_id = ?')
      params.push(query.pluginId)
    }
    if (query.types && query.types.length > 0) {
      conditions.push(`type IN (${query.types.map(() => '?').join(', ')})`)
      params.push(...query.types)
    }
    if (query.status && query.status.length > 0) {
      conditions.push(`status IN (${query.status.map(() => '?').join(', ')})`)
      params.push(...query.status)
    }
    if (query.priority && query.priority.length > 0) {
      conditions.push(`priority IN (${query.priority.map(() => '?').join(', ')})`)
      params.push(...query.priority)
    }
    if (query.isActionable !== undefined) {
      conditions.push('is_actionable = ?')
      params.push(query.isActionable ? 1 : 0)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''

    let orderClause = 'ORDER BY updated_at DESC'
    if (query.orderBy === 'created_at') {
      orderClause = 'ORDER BY created_at DESC'
    } else if (query.orderBy === 'priority') {
      orderClause = 'ORDER BY priority DESC, updated_at DESC'
    }

    const limit = query.limit ?? 50
    const offset = query.offset ?? 0

    const sql = `SELECT * FROM inbox_items ${where} ${orderClause} LIMIT ? OFFSET ?`
    params.push(limit, offset)

    return mapRows<InboxItem>(this.stmts.prepare(sql).all(...params))
  }

  search(searchText: string, limit = 50, offset = 0): InboxItem[] {
    return mapRows<InboxItem>(
      this.stmts
        .prepare(
          `SELECT inbox_items.* FROM inbox_items
         JOIN inbox_items_fts ON inbox_items.rowid = inbox_items_fts.rowid
         WHERE inbox_items_fts MATCH ?
         ORDER BY rank
         LIMIT ? OFFSET ?`
        )
        .all(searchText, limit, offset)
    )
  }

  count(query: InboxQuery = {}): number {
    const conditions: string[] = []
    const params: unknown[] = []

    if (query.pluginId) {
      conditions.push('plugin_id = ?')
      params.push(query.pluginId)
    }
    if (query.status && query.status.length > 0) {
      conditions.push(`status IN (${query.status.map(() => '?').join(', ')})`)
      params.push(...query.status)
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const row = this.stmts
      .prepare(`SELECT COUNT(*) as count FROM inbox_items ${where}`)
      .get(...params) as { count: number }
    return row.count
  }

  create(data: {
    pluginId: string
    externalId: string
    type: string
    title: string
    body?: string
    preview?: string
    sourceUrl?: string
    priority?: number
    status?: string
    metadata?: string
    isActionable?: boolean
    externalCreatedAt?: number
  }): InboxItem {
    const now = Date.now()
    const id = createId()

    this.stmts
      .prepare(
        `INSERT INTO inbox_items (id, plugin_id, external_id, type, title, body, preview, source_url, priority, status, metadata, is_actionable, external_created_at, synced_at, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.pluginId,
        data.externalId,
        data.type,
        data.title,
        data.body ?? null,
        data.preview ?? null,
        data.sourceUrl ?? null,
        data.priority ?? 0,
        data.status ?? 'unread',
        data.metadata ?? '{}',
        data.isActionable ? 1 : 0,
        data.externalCreatedAt ?? null,
        now,
        now,
        now
      )

    return {
      id,
      pluginId: data.pluginId,
      externalId: data.externalId,
      type: data.type,
      title: data.title,
      body: data.body ?? null,
      preview: data.preview ?? null,
      sourceUrl: data.sourceUrl ?? null,
      priority: data.priority ?? 0,
      status: data.status ?? 'unread',
      aiClassification: null,
      aiSummary: null,
      aiDraft: null,
      metadata: data.metadata ?? '{}',
      isActionable: data.isActionable ? 1 : 0,
      snoozedUntil: null,
      externalCreatedAt: data.externalCreatedAt ?? null,
      syncedAt: now,
      createdAt: now,
      updatedAt: now
    }
  }

  update(
    id: string,
    data: {
      title?: string
      body?: string
      preview?: string
      sourceUrl?: string
      priority?: number
      status?: string
      aiClassification?: string | null
      aiSummary?: string | null
      aiDraft?: string | null
      metadata?: string
      isActionable?: boolean
      snoozedUntil?: number | null
    }
  ): InboxItem | undefined {
    const existing = this.get(id)
    if (!existing) return undefined

    const now = Date.now()
    const title = data.title ?? existing.title
    const body = data.body !== undefined ? data.body : existing.body
    const preview = data.preview !== undefined ? data.preview : existing.preview
    const sourceUrl = data.sourceUrl !== undefined ? data.sourceUrl : existing.sourceUrl
    const priority = data.priority ?? existing.priority
    const status = data.status ?? existing.status
    const aiClassification = data.aiClassification !== undefined ? data.aiClassification : existing.aiClassification
    const aiSummary = data.aiSummary !== undefined ? data.aiSummary : existing.aiSummary
    const aiDraft = data.aiDraft !== undefined ? data.aiDraft : existing.aiDraft
    const metadata = data.metadata ?? existing.metadata
    const isActionable = data.isActionable !== undefined ? (data.isActionable ? 1 : 0) : existing.isActionable
    const snoozedUntil = data.snoozedUntil !== undefined ? data.snoozedUntil : existing.snoozedUntil

    this.stmts
      .prepare(
        `UPDATE inbox_items SET title = ?, body = ?, preview = ?, source_url = ?, priority = ?, status = ?,
         ai_classification = ?, ai_summary = ?, ai_draft = ?, metadata = ?, is_actionable = ?,
         snoozed_until = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(
        title, body, preview, sourceUrl, priority, status,
        aiClassification, aiSummary, aiDraft, metadata, isActionable,
        snoozedUntil, now, id
      )

    return {
      ...existing,
      title, body, preview, sourceUrl, priority, status,
      aiClassification, aiSummary, aiDraft, metadata, isActionable,
      snoozedUntil, updatedAt: now
    }
  }

  /** Upsert by (pluginId, externalId). Returns created or updated item. */
  upsert(data: {
    pluginId: string
    externalId: string
    type: string
    title: string
    body?: string
    preview?: string
    sourceUrl?: string
    priority?: number
    metadata?: string
    isActionable?: boolean
    externalCreatedAt?: number
  }): { item: InboxItem; created: boolean } {
    const existing = this.getByExternalId(data.pluginId, data.externalId)
    if (existing) {
      const updated = this.update(existing.id, {
        title: data.title,
        body: data.body,
        preview: data.preview,
        sourceUrl: data.sourceUrl,
        priority: data.priority,
        metadata: data.metadata,
        isActionable: data.isActionable
      })!
      return { item: updated, created: false }
    }
    return { item: this.create(data), created: true }
  }

  /** Batch upsert items from a plugin sync. */
  batchUpsert(
    items: Array<{
      pluginId: string
      externalId: string
      type: string
      title: string
      body?: string
      preview?: string
      sourceUrl?: string
      priority?: number
      metadata?: string
      isActionable?: boolean
      externalCreatedAt?: number
    }>
  ): { created: number; updated: number } {
    let created = 0
    let updated = 0

    const run = this.db.transaction(() => {
      for (const item of items) {
        const result = this.upsert(item)
        if (result.created) created++
        else updated++
      }
    })
    run()

    return { created, updated }
  }

  markRead(ids: string[]): void {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(', ')
    const now = Date.now()
    this.stmts
      .prepare(
        `UPDATE inbox_items SET status = 'read', updated_at = ? WHERE id IN (${placeholders}) AND status = 'unread'`
      )
      .run(now, ...ids)
  }

  archive(ids: string[]): void {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(', ')
    const now = Date.now()
    this.stmts
      .prepare(
        `UPDATE inbox_items SET status = 'archived', updated_at = ? WHERE id IN (${placeholders})`
      )
      .run(now, ...ids)
  }

  snooze(id: string, until: number): InboxItem | undefined {
    return this.update(id, { status: 'snoozed', snoozedUntil: until })
  }

  unsnoozeExpired(): number {
    const now = Date.now()
    const result = this.stmts
      .prepare(
        `UPDATE inbox_items SET status = 'unread', snoozed_until = NULL, updated_at = ?
         WHERE status = 'snoozed' AND snoozed_until <= ?`
      )
      .run(now, now)
    return result.changes
  }

  delete(id: string): boolean {
    const result = this.stmts
      .prepare('DELETE FROM inbox_items WHERE id = ?')
      .run(id)
    return result.changes > 0
  }

  deleteByPlugin(pluginId: string): number {
    const result = this.stmts
      .prepare('DELETE FROM inbox_items WHERE plugin_id = ?')
      .run(pluginId)
    return result.changes
  }

  markUnread(ids: string[]): void {
    if (ids.length === 0) return
    const placeholders = ids.map(() => '?').join(', ')
    const now = Date.now()
    this.stmts
      .prepare(
        `UPDATE inbox_items SET status = 'unread', updated_at = ? WHERE id IN (${placeholders})`
      )
      .run(now, ...ids)
  }

  unsnooze(id: string): void {
    const now = Date.now()
    this.stmts
      .prepare(
        `UPDATE inbox_items SET status = 'unread', snoozed_until = NULL, updated_at = ? WHERE id = ?`
      )
      .run(now, id)
  }

  getStats(): InboxStats {
    const unread = this.stmts
      .prepare(
        "SELECT COUNT(*) as count FROM inbox_items WHERE status = 'unread'"
      )
      .get() as { count: number }

    const actionable = this.stmts
      .prepare(
        'SELECT COUNT(*) as count FROM inbox_items WHERE is_actionable = 1'
      )
      .get() as { count: number }

    const pluginRows = this.stmts
      .prepare(
        "SELECT plugin_id, COUNT(*) as count FROM inbox_items WHERE status = 'unread' GROUP BY plugin_id"
      )
      .all() as { plugin_id: string; count: number }[]

    const pluginCounts: Record<string, number> = {}
    for (const row of pluginRows) {
      pluginCounts[row.plugin_id] = row.count
    }

    return {
      unreadCount: unread.count,
      actionableCount: actionable.count,
      pluginCounts
    }
  }

  updateAiFields(
    id: string,
    fields: {
      aiClassification?: string
      aiSummary?: string
      aiDraft?: string
    }
  ): void {
    const existing = this.get(id)
    if (!existing) return

    const now = Date.now()
    const aiClassification =
      fields.aiClassification !== undefined
        ? fields.aiClassification
        : existing.aiClassification
    const aiSummary =
      fields.aiSummary !== undefined
        ? fields.aiSummary
        : existing.aiSummary
    const aiDraft =
      fields.aiDraft !== undefined ? fields.aiDraft : existing.aiDraft

    this.stmts
      .prepare(
        `UPDATE inbox_items SET ai_classification = ?, ai_summary = ?, ai_draft = ?, updated_at = ? WHERE id = ?`
      )
      .run(aiClassification, aiSummary, aiDraft, now, id)
  }
}
