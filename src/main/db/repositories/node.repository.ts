import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache } from '../statement-cache'
import type { FlowNode } from '../schema'

export class NodeRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  listByWorkflow(workflowId: string): FlowNode[] {
    return this.stmts
      .prepare(
        'SELECT * FROM flow_nodes WHERE workflow_id = ? ORDER BY created_at ASC'
      )
      .all(workflowId) as FlowNode[]
  }

  get(id: string): FlowNode | undefined {
    return this.stmts
      .prepare('SELECT * FROM flow_nodes WHERE id = ?')
      .get(id) as FlowNode | undefined
  }

  create(data: {
    workflowId: string
    type: string
    label?: string
    x?: number
    y?: number
    config?: string
  }): FlowNode {
    const now = Date.now()
    const id = createId()
    const label = data.label ?? ''
    const x = data.x ?? 0
    const y = data.y ?? 0
    const config = data.config ?? '{}'

    this.stmts
      .prepare(
        `INSERT INTO flow_nodes (id, workflow_id, type, label, x, y, config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.workflowId, data.type, label, x, y, config, now, now)

    return {
      id,
      workflowId: data.workflowId,
      type: data.type,
      label,
      x,
      y,
      config,
      createdAt: now,
      updatedAt: now
    }
  }

  update(
    id: string,
    data: {
      type?: string
      label?: string
      x?: number
      y?: number
      config?: string
    }
  ): FlowNode | undefined {
    const existing = this.get(id)
    if (!existing) return undefined

    const now = Date.now()
    const type = data.type ?? existing.type
    const label = data.label ?? existing.label
    const x = data.x ?? existing.x
    const y = data.y ?? existing.y
    const config = data.config ?? existing.config

    this.stmts
      .prepare(
        `UPDATE flow_nodes SET type = ?, label = ?, x = ?, y = ?, config = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(type, label, x, y, config, now, id)

    return { ...existing, type, label, x, y, config, updatedAt: now }
  }

  delete(id: string): boolean {
    const result = this.stmts
      .prepare('DELETE FROM flow_nodes WHERE id = ?')
      .run(id)
    return result.changes > 0
  }

  batchCreate(
    nodes: Array<{
      workflowId: string
      type: string
      label?: string
      x?: number
      y?: number
      config?: string
    }>
  ): FlowNode[] {
    const insert = this.db.transaction(() => {
      return nodes.map((data) => this.create(data))
    })
    return insert()
  }

  batchUpdate(
    updates: Array<{
      id: string
      type?: string
      label?: string
      x?: number
      y?: number
      config?: string
    }>
  ): FlowNode[] {
    const update = this.db.transaction(() => {
      return updates
        .map((data) => this.update(data.id, data))
        .filter((n): n is FlowNode => n !== undefined)
    })
    return update()
  }
}
