import type { Database } from 'better-sqlite3'
import { StatementCache } from '../statement-cache'
import type { PluginSyncState } from '../schema'

export class PluginSyncRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  get(pluginId: string, dataSourceId: string): PluginSyncState | undefined {
    return this.stmts
      .prepare(
        'SELECT * FROM plugin_sync_state WHERE plugin_id = ? AND data_source_id = ?'
      )
      .get(pluginId, dataSourceId) as PluginSyncState | undefined
  }

  listByPlugin(pluginId: string): PluginSyncState[] {
    return this.stmts
      .prepare('SELECT * FROM plugin_sync_state WHERE plugin_id = ? ORDER BY data_source_id ASC')
      .all(pluginId) as PluginSyncState[]
  }

  listByStatus(status: string): PluginSyncState[] {
    return this.stmts
      .prepare('SELECT * FROM plugin_sync_state WHERE sync_status = ?')
      .all(status) as PluginSyncState[]
  }

  listAll(): PluginSyncState[] {
    return this.stmts
      .prepare('SELECT * FROM plugin_sync_state ORDER BY plugin_id, data_source_id')
      .all() as PluginSyncState[]
  }

  create(data: {
    pluginId: string
    dataSourceId: string
    syncStatus?: string
  }): PluginSyncState {
    const now = Date.now()

    this.stmts
      .prepare(
        `INSERT INTO plugin_sync_state (plugin_id, data_source_id, sync_status, items_synced, created_at, updated_at)
         VALUES (?, ?, ?, 0, ?, ?)`
      )
      .run(data.pluginId, data.dataSourceId, data.syncStatus ?? 'idle', now, now)

    return {
      pluginId: data.pluginId,
      dataSourceId: data.dataSourceId,
      lastSyncAt: null,
      syncCursor: null,
      syncStatus: data.syncStatus ?? 'idle',
      error: null,
      itemsSynced: 0,
      createdAt: now,
      updatedAt: now
    }
  }

  /** Get or create sync state for a plugin data source. */
  getOrCreate(pluginId: string, dataSourceId: string): PluginSyncState {
    const existing = this.get(pluginId, dataSourceId)
    if (existing) return existing
    return this.create({ pluginId, dataSourceId })
  }

  update(
    pluginId: string,
    dataSourceId: string,
    data: {
      lastSyncAt?: number
      syncCursor?: string | null
      syncStatus?: string
      error?: string | null
      itemsSynced?: number
    }
  ): PluginSyncState | undefined {
    const existing = this.get(pluginId, dataSourceId)
    if (!existing) return undefined

    const now = Date.now()
    const lastSyncAt = data.lastSyncAt !== undefined ? data.lastSyncAt : existing.lastSyncAt
    const syncCursor = data.syncCursor !== undefined ? data.syncCursor : existing.syncCursor
    const syncStatus = data.syncStatus ?? existing.syncStatus
    const error = data.error !== undefined ? data.error : existing.error
    const itemsSynced = data.itemsSynced ?? existing.itemsSynced

    this.stmts
      .prepare(
        `UPDATE plugin_sync_state SET last_sync_at = ?, sync_cursor = ?, sync_status = ?,
         error = ?, items_synced = ?, updated_at = ?
         WHERE plugin_id = ? AND data_source_id = ?`
      )
      .run(lastSyncAt, syncCursor, syncStatus, error, itemsSynced, now, pluginId, dataSourceId)

    return {
      ...existing,
      lastSyncAt, syncCursor, syncStatus, error, itemsSynced,
      updatedAt: now
    }
  }

  /** Mark a data source as syncing. */
  markSyncing(pluginId: string, dataSourceId: string): PluginSyncState | undefined {
    return this.update(pluginId, dataSourceId, {
      syncStatus: 'syncing',
      error: null
    })
  }

  /** Mark a data source sync as complete. */
  markComplete(
    pluginId: string,
    dataSourceId: string,
    syncCursor?: string,
    itemsSynced?: number
  ): PluginSyncState | undefined {
    return this.update(pluginId, dataSourceId, {
      syncStatus: 'idle',
      lastSyncAt: Date.now(),
      syncCursor: syncCursor ?? undefined,
      itemsSynced,
      error: null
    })
  }

  /** Mark a data source sync as errored. */
  markError(
    pluginId: string,
    dataSourceId: string,
    error: string
  ): PluginSyncState | undefined {
    return this.update(pluginId, dataSourceId, {
      syncStatus: 'error',
      error
    })
  }

  delete(pluginId: string, dataSourceId: string): boolean {
    const result = this.stmts
      .prepare(
        'DELETE FROM plugin_sync_state WHERE plugin_id = ? AND data_source_id = ?'
      )
      .run(pluginId, dataSourceId)
    return result.changes > 0
  }

  deleteByPlugin(pluginId: string): number {
    const result = this.stmts
      .prepare('DELETE FROM plugin_sync_state WHERE plugin_id = ?')
      .run(pluginId)
    return result.changes
  }

  upsert(state: {
    pluginId: string
    dataSourceId: string
    syncCursor?: string
    syncStatus: string
    itemsSynced?: number
  }): PluginSyncState {
    const existing = this.get(state.pluginId, state.dataSourceId)
    if (existing) {
      return this.update(state.pluginId, state.dataSourceId, {
        syncCursor: state.syncCursor,
        syncStatus: state.syncStatus,
        itemsSynced: state.itemsSynced
      })!
    }
    const created = this.create({
      pluginId: state.pluginId,
      dataSourceId: state.dataSourceId,
      syncStatus: state.syncStatus
    })
    if (state.syncCursor || state.itemsSynced) {
      return this.update(state.pluginId, state.dataSourceId, {
        syncCursor: state.syncCursor,
        itemsSynced: state.itemsSynced
      })!
    }
    return created
  }

  updateStatus(
    pluginId: string,
    dataSourceId: string,
    status: string,
    error?: string
  ): void {
    const now = Date.now()
    this.stmts
      .prepare(
        `UPDATE plugin_sync_state SET sync_status = ?, error = ?, updated_at = ?
         WHERE plugin_id = ? AND data_source_id = ?`
      )
      .run(status, error ?? null, now, pluginId, dataSourceId)
  }

  getAll(): PluginSyncState[] {
    return this.listAll()
  }
}
