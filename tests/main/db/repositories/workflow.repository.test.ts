import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedWorkspace, seedWorkflow } from '../../../helpers/test-db'
import { WorkflowRepository } from '../../../../src/main/db/repositories/workflow.repository'
import { NodeRepository } from '../../../../src/main/db/repositories/node.repository'
import { EdgeRepository } from '../../../../src/main/db/repositories/edge.repository'

describe('WorkflowRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: WorkflowRepository
  const wsId = 'test-ws'

  beforeEach(() => {
    db = createTestDb()
    repo = new WorkflowRepository(db)
    seedWorkspace(db, wsId)
  })
  afterEach(() => { db.close() })

  describe('list', () => {
    it('returns empty array when no workflows exist', () => {
      expect(repo.list(wsId)).toEqual([])
    })

    it('returns workflows for a given workspace ordered by updated_at DESC', () => {
      const wf1 = repo.create({ workspaceId: wsId, name: 'Flow A' })
      const wf2 = repo.create({ workspaceId: wsId, name: 'Flow B' })
      const list = repo.list(wsId)
      expect(list).toHaveLength(2)
      // Most recently updated first
      expect(list[0].id).toBe(wf2.id)
      expect(list[1].id).toBe(wf1.id)
    })

    it('does not return workflows from other workspaces', () => {
      seedWorkspace(db, 'other-ws')
      repo.create({ workspaceId: wsId, name: 'Mine' })
      repo.create({ workspaceId: 'other-ws', name: 'Other' })
      expect(repo.list(wsId)).toHaveLength(1)
      expect(repo.list('other-ws')).toHaveLength(1)
    })

    it('supports limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        repo.create({ workspaceId: wsId, name: `Flow ${i}` })
      }
      const page = repo.list(wsId, 2, 1)
      expect(page).toHaveLength(2)
    })
  })

  describe('get', () => {
    it('returns undefined for non-existent id', () => {
      expect(repo.get('non-existent')).toBeUndefined()
    })

    it('returns workflow by id', () => {
      const wf = repo.create({ workspaceId: wsId, name: 'Test' })
      const fetched = repo.get(wf.id) as any
      expect(fetched).toBeDefined()
      expect(fetched.name).toBe('Test')
      // SELECT * returns snake_case columns from SQLite
      expect(fetched.workspace_id).toBe(wsId)
    })
  })

  describe('getWithNodes', () => {
    it('returns undefined for non-existent workflow', () => {
      expect(repo.getWithNodes('non-existent')).toBeUndefined()
    })

    it('returns workflow with empty nodes and edges', () => {
      const wf = repo.create({ workspaceId: wsId, name: 'Empty Flow' })
      const result = repo.getWithNodes(wf.id)
      expect(result).toBeDefined()
      expect(result!.workflow.id).toBe(wf.id)
      expect(result!.nodes).toEqual([])
      expect(result!.edges).toEqual([])
    })

    it('returns workflow with associated nodes and edges', () => {
      const wf = repo.create({ workspaceId: wsId, name: 'Full Flow' })
      const nodeRepo = new NodeRepository(db)
      const edgeRepo = new EdgeRepository(db)

      const n1 = nodeRepo.create({ workflowId: wf.id, type: 'trigger' })
      const n2 = nodeRepo.create({ workflowId: wf.id, type: 'action' })
      edgeRepo.create({
        workflowId: wf.id,
        sourceNodeId: n1.id,
        targetNodeId: n2.id
      })

      const result = repo.getWithNodes(wf.id)
      expect(result!.nodes).toHaveLength(2)
      expect(result!.edges).toHaveLength(1)
      // SELECT * returns snake_case columns from SQLite
      expect((result!.edges[0] as any).source_node_id).toBe(n1.id)
      expect((result!.edges[0] as any).target_node_id).toBe(n2.id)
    })
  })

  describe('create', () => {
    it('creates a workflow with defaults', () => {
      const wf = repo.create({ workspaceId: wsId, name: 'New Flow' })
      expect(wf.id).toBeTruthy()
      expect(wf.name).toBe('New Flow')
      expect(wf.workspaceId).toBe(wsId)
      expect(wf.description).toBe('')
      expect(wf.status).toBe('draft')
      expect(wf.triggerConfig).toBe('{}')
      expect(wf.createdAt).toBeGreaterThan(0)
    })

    it('creates a workflow with custom fields', () => {
      const wf = repo.create({
        workspaceId: wsId,
        name: 'Custom',
        description: 'My description',
        status: 'active',
        triggerConfig: '{"type":"cron","schedule":"*/5 * * * *"}'
      })
      expect(wf.description).toBe('My description')
      expect(wf.status).toBe('active')
      expect(wf.triggerConfig).toBe('{"type":"cron","schedule":"*/5 * * * *"}')
    })
  })

  describe('update', () => {
    it('returns undefined for non-existent id', () => {
      expect(repo.update('non-existent', { name: 'X' })).toBeUndefined()
    })

    it('updates name only', () => {
      const wf = repo.create({ workspaceId: wsId, name: 'Old' })
      const updated = repo.update(wf.id, { name: 'New' })
      expect(updated!.name).toBe('New')
      expect(updated!.description).toBe('')
    })

    it('updates status', () => {
      const wf = repo.create({ workspaceId: wsId, name: 'Flow' })
      const updated = repo.update(wf.id, { status: 'active' })
      expect(updated!.status).toBe('active')
    })

    it('updates updatedAt timestamp', () => {
      const wf = repo.create({ workspaceId: wsId, name: 'Flow' })
      const updated = repo.update(wf.id, { name: 'Flow 2' })
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(wf.updatedAt)
    })

    it('persists changes', () => {
      const wf = repo.create({ workspaceId: wsId, name: 'Before' })
      repo.update(wf.id, { name: 'After', description: 'Updated' })
      const fetched = repo.get(wf.id)
      expect(fetched!.name).toBe('After')
      expect(fetched!.description).toBe('Updated')
    })
  })

  describe('delete', () => {
    it('returns false for non-existent id', () => {
      expect(repo.delete('non-existent')).toBe(false)
    })

    it('deletes a workflow and returns true', () => {
      const wf = repo.create({ workspaceId: wsId, name: 'To Delete' })
      expect(repo.delete(wf.id)).toBe(true)
      expect(repo.get(wf.id)).toBeUndefined()
    })

    it('does not affect other workflows', () => {
      const wf1 = repo.create({ workspaceId: wsId, name: 'Keep' })
      const wf2 = repo.create({ workspaceId: wsId, name: 'Delete' })
      repo.delete(wf2.id)
      expect(repo.get(wf1.id)).toBeDefined()
      expect(repo.list(wsId)).toHaveLength(1)
    })
  })
})
