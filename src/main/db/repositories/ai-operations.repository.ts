import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache } from '../statement-cache'
import type { AiOperation, NewAiOperation } from '../schema'

export interface AiUsageSummary {
  provider: string
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  operationCount: number
}

export interface AiUsage {
  totalInputTokens: number
  totalOutputTokens: number
  totalCostUsd: number
  operationCount: number
}

export interface AiUsageByGroup extends AiUsage {
  group: string
}

export class AiOperationsRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  get(id: string): AiOperation | undefined {
    return this.stmts
      .prepare('SELECT * FROM ai_operations WHERE id = ?')
      .get(id) as AiOperation | undefined
  }

  list(limit = 50, offset = 0): AiOperation[] {
    return this.stmts
      .prepare(
        'SELECT * FROM ai_operations ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      .all(limit, offset) as AiOperation[]
  }

  listByPlugin(pluginId: string, limit = 50, offset = 0): AiOperation[] {
    return this.stmts
      .prepare(
        'SELECT * FROM ai_operations WHERE plugin_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      .all(pluginId, limit, offset) as AiOperation[]
  }

  listByInboxItem(inboxItemId: string): AiOperation[] {
    return this.stmts
      .prepare(
        'SELECT * FROM ai_operations WHERE inbox_item_id = ? ORDER BY created_at DESC'
      )
      .all(inboxItemId) as AiOperation[]
  }

  create(data: {
    provider: string
    model: string
    operation: string
    pluginId?: string
    pipelineId?: string
    inboxItemId?: string
    executionId?: string
    inputTokens?: number
    outputTokens?: number
    costUsd?: number
    durationMs?: number
  }): AiOperation {
    const now = Date.now()
    const id = createId()

    this.stmts
      .prepare(
        `INSERT INTO ai_operations (id, provider, model, operation, plugin_id, pipeline_id, inbox_item_id, execution_id, input_tokens, output_tokens, cost_usd, duration_ms, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.provider,
        data.model,
        data.operation,
        data.pluginId ?? null,
        data.pipelineId ?? null,
        data.inboxItemId ?? null,
        data.executionId ?? null,
        data.inputTokens ?? 0,
        data.outputTokens ?? 0,
        data.costUsd ?? 0.0,
        data.durationMs ?? null,
        now
      )

    return {
      id,
      provider: data.provider,
      model: data.model,
      operation: data.operation,
      pluginId: data.pluginId ?? null,
      pipelineId: data.pipelineId ?? null,
      inboxItemId: data.inboxItemId ?? null,
      executionId: data.executionId ?? null,
      inputTokens: data.inputTokens ?? 0,
      outputTokens: data.outputTokens ?? 0,
      costUsd: data.costUsd ?? 0.0,
      durationMs: data.durationMs ?? null,
      createdAt: now
    }
  }

  /** Get usage summary grouped by provider for a time range. */
  getUsageSummary(sinceMs?: number): AiUsageSummary[] {
    const since = sinceMs ?? 0
    return this.stmts
      .prepare(
        `SELECT
          provider,
          SUM(input_tokens) as totalInputTokens,
          SUM(output_tokens) as totalOutputTokens,
          SUM(cost_usd) as totalCostUsd,
          COUNT(*) as operationCount
         FROM ai_operations
         WHERE created_at >= ?
         GROUP BY provider
         ORDER BY totalCostUsd DESC`
      )
      .all(since) as AiUsageSummary[]
  }

  /** Get total cost for a specific plugin in a time range. */
  getPluginCost(pluginId: string, sinceMs?: number): number {
    const since = sinceMs ?? 0
    const row = this.stmts
      .prepare(
        `SELECT COALESCE(SUM(cost_usd), 0.0) as total
         FROM ai_operations
         WHERE plugin_id = ? AND created_at >= ?`
      )
      .get(pluginId, since) as { total: number }
    return row.total
  }

  /** Get operation count for the current billing period (for tier enforcement). */
  getOperationCount(sinceMs: number): number {
    const row = this.stmts
      .prepare(
        `SELECT COUNT(*) as count FROM ai_operations WHERE created_at >= ?`
      )
      .get(sinceMs) as { count: number }
    return row.count
  }

  /** Delete operations older than a given timestamp (cleanup). */
  deleteOlderThan(beforeMs: number): number {
    const result = this.stmts
      .prepare('DELETE FROM ai_operations WHERE created_at < ?')
      .run(beforeMs)
    return result.changes
  }

  log(op: NewAiOperation): AiOperation {
    return this.create({
      provider: op.provider,
      model: op.model,
      operation: op.operation,
      pluginId: op.pluginId ?? undefined,
      pipelineId: op.pipelineId ?? undefined,
      inboxItemId: op.inboxItemId ?? undefined,
      executionId: op.executionId ?? undefined,
      inputTokens: op.inputTokens ?? 0,
      outputTokens: op.outputTokens ?? 0,
      costUsd: op.costUsd ?? 0,
      durationMs: op.durationMs ?? undefined
    })
  }

  getUsage(
    filters: {
      provider?: string
      pluginId?: string
      dateFrom?: number
      dateTo?: number
    } = {}
  ): AiUsage {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters.provider) {
      conditions.push('provider = ?')
      params.push(filters.provider)
    }
    if (filters.pluginId) {
      conditions.push('plugin_id = ?')
      params.push(filters.pluginId)
    }
    if (filters.dateFrom) {
      conditions.push('created_at >= ?')
      params.push(filters.dateFrom)
    }
    if (filters.dateTo) {
      conditions.push('created_at <= ?')
      params.push(filters.dateTo)
    }

    const where =
      conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''

    const row = this.stmts
      .prepare(
        `SELECT
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COUNT(*) as operation_count
         FROM ai_operations ${where}`
      )
      .get(...params) as {
      total_input_tokens: number
      total_output_tokens: number
      total_cost_usd: number
      operation_count: number
    }

    return {
      totalInputTokens: row.total_input_tokens,
      totalOutputTokens: row.total_output_tokens,
      totalCostUsd: row.total_cost_usd,
      operationCount: row.operation_count
    }
  }

  getUsageByProvider(dateFrom: number, dateTo: number): AiUsageByGroup[] {
    const rows = this.stmts
      .prepare(
        `SELECT
          provider as grp,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COUNT(*) as operation_count
         FROM ai_operations
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY provider`
      )
      .all(dateFrom, dateTo) as Array<{
      grp: string
      total_input_tokens: number
      total_output_tokens: number
      total_cost_usd: number
      operation_count: number
    }>

    return rows.map((r) => ({
      group: r.grp,
      totalInputTokens: r.total_input_tokens,
      totalOutputTokens: r.total_output_tokens,
      totalCostUsd: r.total_cost_usd,
      operationCount: r.operation_count
    }))
  }

  getUsageByPlugin(dateFrom: number, dateTo: number): AiUsageByGroup[] {
    const rows = this.stmts
      .prepare(
        `SELECT
          COALESCE(plugin_id, 'system') as grp,
          COALESCE(SUM(input_tokens), 0) as total_input_tokens,
          COALESCE(SUM(output_tokens), 0) as total_output_tokens,
          COALESCE(SUM(cost_usd), 0) as total_cost_usd,
          COUNT(*) as operation_count
         FROM ai_operations
         WHERE created_at >= ? AND created_at <= ?
         GROUP BY plugin_id`
      )
      .all(dateFrom, dateTo) as Array<{
      grp: string
      total_input_tokens: number
      total_output_tokens: number
      total_cost_usd: number
      operation_count: number
    }>

    return rows.map((r) => ({
      group: r.grp,
      totalInputTokens: r.total_input_tokens,
      totalOutputTokens: r.total_output_tokens,
      totalCostUsd: r.total_cost_usd,
      operationCount: r.operation_count
    }))
  }

  getDailyUsage(date: number): AiUsage {
    const d = new Date(date)
    d.setHours(0, 0, 0, 0)
    const startOfDay = d.getTime()
    d.setHours(23, 59, 59, 999)
    const endOfDay = d.getTime()

    return this.getUsage({ dateFrom: startOfDay, dateTo: endOfDay })
  }

  listFiltered(
    filters: {
      provider?: string
      model?: string
      pluginId?: string
      limit?: number
      offset?: number
    } = {}
  ): AiOperation[] {
    const conditions: string[] = []
    const params: unknown[] = []

    if (filters.provider) {
      conditions.push('provider = ?')
      params.push(filters.provider)
    }
    if (filters.model) {
      conditions.push('model = ?')
      params.push(filters.model)
    }
    if (filters.pluginId) {
      conditions.push('plugin_id = ?')
      params.push(filters.pluginId)
    }

    const where =
      conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : ''
    const limit = filters.limit ?? 50
    const offset = filters.offset ?? 0
    params.push(limit, offset)

    const sql = `SELECT * FROM ai_operations ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`
    return this.stmts.prepare(sql).all(...params) as AiOperation[]
  }
}
