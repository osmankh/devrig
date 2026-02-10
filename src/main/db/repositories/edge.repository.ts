import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache } from '../statement-cache'
import type { FlowEdge } from '../schema'

export class EdgeRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  listByWorkflow(workflowId: string): FlowEdge[] {
    return this.stmts
      .prepare(
        'SELECT * FROM flow_edges WHERE workflow_id = ? ORDER BY created_at ASC'
      )
      .all(workflowId) as FlowEdge[]
  }

  get(id: string): FlowEdge | undefined {
    return this.stmts
      .prepare('SELECT * FROM flow_edges WHERE id = ?')
      .get(id) as FlowEdge | undefined
  }

  create(data: {
    workflowId: string
    sourceNodeId: string
    targetNodeId: string
    sourceHandle?: string
    targetHandle?: string
    label?: string
  }): FlowEdge {
    const now = Date.now()
    const id = createId()
    const label = data.label ?? ''

    this.stmts
      .prepare(
        `INSERT INTO flow_edges (id, workflow_id, source_node_id, target_node_id, source_handle, target_handle, label, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        id,
        data.workflowId,
        data.sourceNodeId,
        data.targetNodeId,
        data.sourceHandle ?? null,
        data.targetHandle ?? null,
        label,
        now
      )

    return {
      id,
      workflowId: data.workflowId,
      sourceNodeId: data.sourceNodeId,
      targetNodeId: data.targetNodeId,
      sourceHandle: data.sourceHandle ?? null,
      targetHandle: data.targetHandle ?? null,
      label,
      createdAt: now
    }
  }

  delete(id: string): boolean {
    const result = this.stmts
      .prepare('DELETE FROM flow_edges WHERE id = ?')
      .run(id)
    return result.changes > 0
  }

  batchCreate(
    edges: Array<{
      workflowId: string
      sourceNodeId: string
      targetNodeId: string
      sourceHandle?: string
      targetHandle?: string
      label?: string
    }>
  ): FlowEdge[] {
    const insert = this.db.transaction(() => {
      return edges.map((data) => this.create(data))
    })
    return insert()
  }
}
