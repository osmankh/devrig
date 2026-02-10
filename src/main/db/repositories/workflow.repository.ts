import type { Database } from 'better-sqlite3'
import { createId } from '@paralleldrive/cuid2'
import { StatementCache } from '../statement-cache'
import type { Workflow, FlowNode, FlowEdge } from '../schema'

export interface WorkflowWithNodes {
  workflow: Workflow
  nodes: FlowNode[]
  edges: FlowEdge[]
}

export class WorkflowRepository {
  private stmts: StatementCache

  constructor(private db: Database) {
    this.stmts = new StatementCache(db)
  }

  list(workspaceId: string, limit = 50, offset = 0): Workflow[] {
    return this.stmts
      .prepare(
        'SELECT * FROM workflows WHERE workspace_id = ? ORDER BY updated_at DESC LIMIT ? OFFSET ?'
      )
      .all(workspaceId, limit, offset) as Workflow[]
  }

  get(id: string): Workflow | undefined {
    return this.stmts
      .prepare('SELECT * FROM workflows WHERE id = ?')
      .get(id) as Workflow | undefined
  }

  getWithNodes(id: string): WorkflowWithNodes | undefined {
    const workflow = this.get(id)
    if (!workflow) return undefined

    const nodes = this.stmts
      .prepare(
        'SELECT * FROM flow_nodes WHERE workflow_id = ? ORDER BY created_at ASC'
      )
      .all(id) as FlowNode[]

    const edges = this.stmts
      .prepare(
        'SELECT * FROM flow_edges WHERE workflow_id = ? ORDER BY created_at ASC'
      )
      .all(id) as FlowEdge[]

    return { workflow, nodes, edges }
  }

  create(data: {
    workspaceId: string
    name: string
    description?: string
    status?: string
    triggerConfig?: string
  }): Workflow {
    const now = Date.now()
    const id = createId()
    const description = data.description ?? ''
    const status = data.status ?? 'draft'
    const triggerConfig = data.triggerConfig ?? '{}'

    this.stmts
      .prepare(
        `INSERT INTO workflows (id, workspace_id, name, description, status, trigger_config, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(id, data.workspaceId, data.name, description, status, triggerConfig, now, now)

    return {
      id,
      workspaceId: data.workspaceId,
      name: data.name,
      description,
      status,
      triggerConfig,
      createdAt: now,
      updatedAt: now
    }
  }

  update(
    id: string,
    data: {
      name?: string
      description?: string
      status?: string
      triggerConfig?: string
    }
  ): Workflow | undefined {
    const existing = this.get(id)
    if (!existing) return undefined

    const now = Date.now()
    const name = data.name ?? existing.name
    const description = data.description ?? existing.description
    const status = data.status ?? existing.status
    const triggerConfig = data.triggerConfig ?? existing.triggerConfig

    this.stmts
      .prepare(
        `UPDATE workflows SET name = ?, description = ?, status = ?, trigger_config = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(name, description, status, triggerConfig, now, id)

    return {
      ...existing,
      name,
      description,
      status,
      triggerConfig,
      updatedAt: now
    }
  }

  delete(id: string): boolean {
    const result = this.stmts
      .prepare('DELETE FROM workflows WHERE id = ?')
      .run(id)
    return result.changes > 0
  }
}
