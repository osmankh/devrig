import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache, mapRow, mapRows } from '../statement-cache'
import type { Execution, ExecutionStep } from '../schema'

export interface ExecutionWithSteps {
  execution: Execution
  steps: ExecutionStep[]
}

export class ExecutionRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  list(workflowId: string, limit = 50, offset = 0): Execution[] {
    return mapRows<Execution>(
      this.stmts
        .prepare(
          'SELECT * FROM executions WHERE workflow_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
        )
        .all(workflowId, limit, offset)
    )
  }

  get(id: string): Execution | undefined {
    const row = this.stmts
      .prepare('SELECT * FROM executions WHERE id = ?')
      .get(id)
    return row ? mapRow<Execution>(row) : undefined
  }

  getWithSteps(id: string): ExecutionWithSteps | undefined {
    const execution = this.get(id)
    if (!execution) return undefined

    const steps = mapRows<ExecutionStep>(
      this.stmts
        .prepare(
          'SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY started_at ASC'
        )
        .all(id)
    )

    return { execution, steps }
  }

  create(data: {
    workflowId: string
    triggerType: string
    status?: string
  }): Execution {
    const now = Date.now()
    const id = createId()
    const status = data.status ?? 'pending'

    this.stmts
      .prepare(
        `INSERT INTO executions (id, workflow_id, status, trigger_type, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(id, data.workflowId, status, data.triggerType, now)

    return {
      id,
      workflowId: data.workflowId,
      status,
      triggerType: data.triggerType,
      startedAt: null,
      completedAt: null,
      error: null,
      createdAt: now
    }
  }

  update(
    id: string,
    data: {
      status?: string
      startedAt?: number
      completedAt?: number
      error?: string | null
    }
  ): Execution | undefined {
    const existing = this.get(id)
    if (!existing) return undefined

    const status = data.status ?? existing.status
    const startedAt = data.startedAt ?? existing.startedAt
    const completedAt = data.completedAt ?? existing.completedAt
    const error = data.error !== undefined ? data.error : existing.error

    this.stmts
      .prepare(
        `UPDATE executions SET status = ?, started_at = ?, completed_at = ?, error = ?
         WHERE id = ?`
      )
      .run(status, startedAt, completedAt, error, id)

    return { ...existing, status, startedAt, completedAt, error }
  }

  createStep(data: {
    executionId: string
    nodeId: string
    status: string
  }): ExecutionStep {
    const id = createId()

    this.stmts
      .prepare(
        `INSERT INTO execution_steps (id, execution_id, node_id, status)
         VALUES (?, ?, ?, ?)`
      )
      .run(id, data.executionId, data.nodeId, data.status)

    return {
      id,
      executionId: data.executionId,
      nodeId: data.nodeId,
      status: data.status,
      input: null,
      output: null,
      error: null,
      startedAt: null,
      completedAt: null,
      durationMs: null
    }
  }

  updateStep(
    id: string,
    data: {
      status?: string
      input?: string
      output?: string
      error?: string
      startedAt?: number
      completedAt?: number
      durationMs?: number
    }
  ): ExecutionStep | undefined {
    const existing = this.stmts
      .prepare('SELECT * FROM execution_steps WHERE id = ?')
      .get(id)

    if (!existing) return undefined

    const mapped = mapRow<ExecutionStep>(existing)
    const status = data.status ?? mapped.status
    const input = data.input !== undefined ? data.input : mapped.input
    const output = data.output !== undefined ? data.output : mapped.output
    const error = data.error !== undefined ? data.error : mapped.error
    const startedAt = data.startedAt ?? mapped.startedAt
    const completedAt = data.completedAt ?? mapped.completedAt
    const durationMs = data.durationMs ?? mapped.durationMs

    this.stmts
      .prepare(
        `UPDATE execution_steps SET status = ?, input = ?, output = ?, error = ?, started_at = ?, completed_at = ?, duration_ms = ?
         WHERE id = ?`
      )
      .run(status, input, output, error, startedAt, completedAt, durationMs, id)

    return { ...mapped, status, input, output, error, startedAt, completedAt, durationMs }
  }

  listSteps(executionId: string): ExecutionStep[] {
    return mapRows<ExecutionStep>(
      this.stmts
        .prepare(
          'SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY started_at ASC'
        )
        .all(executionId)
    )
  }
}
