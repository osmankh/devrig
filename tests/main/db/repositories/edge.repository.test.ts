import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedWorkflow } from '../../../helpers/test-db'
import { EdgeRepository } from '../../../../src/main/db/repositories/edge.repository'
import { NodeRepository } from '../../../../src/main/db/repositories/node.repository'

describe('EdgeRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: EdgeRepository
  let nodeRepo: NodeRepository
  const wfId = 'test-wf'
  let sourceId: string
  let targetId: string

  beforeEach(() => {
    db = createTestDb()
    repo = new EdgeRepository(db)
    nodeRepo = new NodeRepository(db)
    seedWorkflow(db, wfId)

    // Create source and target nodes for edges
    const source = nodeRepo.create({ workflowId: wfId, type: 'trigger' })
    const target = nodeRepo.create({ workflowId: wfId, type: 'action' })
    sourceId = source.id
    targetId = target.id
  })
  afterEach(() => { db.close() })

  describe('listByWorkflow', () => {
    it('returns empty array when no edges exist', () => {
      expect(repo.listByWorkflow(wfId)).toEqual([])
    })

    it('returns edges for a workflow ordered by created_at ASC', () => {
      const e1 = repo.create({ workflowId: wfId, sourceNodeId: sourceId, targetNodeId: targetId })

      const node3 = nodeRepo.create({ workflowId: wfId, type: 'condition' })
      const e2 = repo.create({ workflowId: wfId, sourceNodeId: targetId, targetNodeId: node3.id })

      const list = repo.listByWorkflow(wfId)
      expect(list).toHaveLength(2)
      expect(list[0].id).toBe(e1.id)
      expect(list[1].id).toBe(e2.id)
    })

    it('does not return edges from other workflows', () => {
      seedWorkflow(db, 'other-wf')
      const otherNode1 = nodeRepo.create({ workflowId: 'other-wf', type: 'trigger' })
      const otherNode2 = nodeRepo.create({ workflowId: 'other-wf', type: 'action' })

      repo.create({ workflowId: wfId, sourceNodeId: sourceId, targetNodeId: targetId })
      repo.create({ workflowId: 'other-wf', sourceNodeId: otherNode1.id, targetNodeId: otherNode2.id })

      expect(repo.listByWorkflow(wfId)).toHaveLength(1)
      expect(repo.listByWorkflow('other-wf')).toHaveLength(1)
    })
  })

  describe('get', () => {
    it('returns undefined for non-existent id', () => {
      expect(repo.get('non-existent')).toBeUndefined()
    })

    it('returns edge by id', () => {
      const edge = repo.create({ workflowId: wfId, sourceNodeId: sourceId, targetNodeId: targetId })
      const fetched = repo.get(edge.id) as any
      expect(fetched).toBeDefined()
      // SELECT * returns snake_case columns from SQLite
      expect(fetched.source_node_id).toBe(sourceId)
      expect(fetched.target_node_id).toBe(targetId)
    })
  })

  describe('create', () => {
    it('creates an edge with defaults', () => {
      const edge = repo.create({
        workflowId: wfId,
        sourceNodeId: sourceId,
        targetNodeId: targetId
      })
      expect(edge.id).toBeTruthy()
      expect(edge.workflowId).toBe(wfId)
      expect(edge.sourceNodeId).toBe(sourceId)
      expect(edge.targetNodeId).toBe(targetId)
      expect(edge.sourceHandle).toBeNull()
      expect(edge.targetHandle).toBeNull()
      expect(edge.label).toBe('')
      expect(edge.createdAt).toBeGreaterThan(0)
    })

    it('creates an edge with custom handles and label', () => {
      const edge = repo.create({
        workflowId: wfId,
        sourceNodeId: sourceId,
        targetNodeId: targetId,
        sourceHandle: 'output-1',
        targetHandle: 'input-1',
        label: 'On success'
      })
      expect(edge.sourceHandle).toBe('output-1')
      expect(edge.targetHandle).toBe('input-1')
      expect(edge.label).toBe('On success')
    })
  })

  describe('delete', () => {
    it('returns false for non-existent id', () => {
      expect(repo.delete('non-existent')).toBe(false)
    })

    it('deletes an edge and returns true', () => {
      const edge = repo.create({ workflowId: wfId, sourceNodeId: sourceId, targetNodeId: targetId })
      expect(repo.delete(edge.id)).toBe(true)
      expect(repo.get(edge.id)).toBeUndefined()
    })
  })

  describe('deleteByWorkflow', () => {
    it('returns false when no edges exist for workflow', () => {
      expect(repo.deleteByWorkflow(wfId)).toBe(false)
    })

    it('deletes all edges for a workflow', () => {
      const node3 = nodeRepo.create({ workflowId: wfId, type: 'condition' })
      repo.create({ workflowId: wfId, sourceNodeId: sourceId, targetNodeId: targetId })
      repo.create({ workflowId: wfId, sourceNodeId: targetId, targetNodeId: node3.id })

      expect(repo.deleteByWorkflow(wfId)).toBe(true)
      expect(repo.listByWorkflow(wfId)).toEqual([])
    })

    it('does not affect edges in other workflows', () => {
      seedWorkflow(db, 'other-wf')
      const otherNode1 = nodeRepo.create({ workflowId: 'other-wf', type: 'trigger' })
      const otherNode2 = nodeRepo.create({ workflowId: 'other-wf', type: 'action' })

      repo.create({ workflowId: wfId, sourceNodeId: sourceId, targetNodeId: targetId })
      repo.create({ workflowId: 'other-wf', sourceNodeId: otherNode1.id, targetNodeId: otherNode2.id })

      repo.deleteByWorkflow(wfId)
      expect(repo.listByWorkflow('other-wf')).toHaveLength(1)
    })
  })

  describe('batchCreate', () => {
    it('creates multiple edges in a transaction', () => {
      const node3 = nodeRepo.create({ workflowId: wfId, type: 'condition' })
      const edges = repo.batchCreate([
        { workflowId: wfId, sourceNodeId: sourceId, targetNodeId: targetId },
        { workflowId: wfId, sourceNodeId: targetId, targetNodeId: node3.id, label: 'Next' }
      ])
      expect(edges).toHaveLength(2)
      expect(edges[1].label).toBe('Next')
      expect(repo.listByWorkflow(wfId)).toHaveLength(2)
    })

    it('handles empty array', () => {
      const edges = repo.batchCreate([])
      expect(edges).toEqual([])
    })
  })
})
