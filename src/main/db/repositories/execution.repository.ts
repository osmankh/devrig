import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache } from '../statement-cache'
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
    return this.stmts
      .prepare(
        'SELECT * FROM executions WHERE workflow_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?'
      )
      .all(workflowId, limit, offset) as Execution[]
  }

  get(id: string): Execution | undefined {
    return this.stmts
      .prepare('SELECT * FROM executions WHERE id = ?')
      .get(id) as Execution | undefined
  }

  getWithSteps(id: string): ExecutionWithSteps | undefined {
    const execution = this.get(id)
    if (!execution) return undefined

    const steps = this.stmts
      .prepare(
        'SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY started_at ASC'
      )
      .all(id) as ExecutionStep[]

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
}
