import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedWorkflow } from '../../../helpers/test-db'
import { NodeRepository } from '../../../../src/main/db/repositories/node.repository'

describe('NodeRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: NodeRepository
  const wfId = 'test-wf'

  beforeEach(() => {
    db = createTestDb()
    repo = new NodeRepository(db)
    seedWorkflow(db, wfId)
  })
  afterEach(() => { db.close() })

  describe('listByWorkflow', () => {
    it('returns empty array when no nodes exist', () => {
      expect(repo.listByWorkflow(wfId)).toEqual([])
    })

    it('returns nodes for a workflow ordered by created_at ASC', () => {
      const n1 = repo.create({ workflowId: wfId, type: 'trigger' })
      const n2 = repo.create({ workflowId: wfId, type: 'action' })
      const list = repo.listByWorkflow(wfId)
      expect(list).toHaveLength(2)
      expect(list[0].id).toBe(n1.id)
      expect(list[1].id).toBe(n2.id)
    })

    it('does not return nodes from other workflows', () => {
      seedWorkflow(db, 'other-wf')
      repo.create({ workflowId: wfId, type: 'trigger' })
      repo.create({ workflowId: 'other-wf', type: 'action' })
      expect(repo.listByWorkflow(wfId)).toHaveLength(1)
    })
  })

  describe('get', () => {
    it('returns undefined for non-existent id', () => {
      expect(repo.get('non-existent')).toBeUndefined()
    })

    it('returns node by id', () => {
      const node = repo.create({ workflowId: wfId, type: 'trigger', label: 'Start' })
      const fetched = repo.get(node.id)
      expect(fetched).toBeDefined()
      expect(fetched!.type).toBe('trigger')
      expect(fetched!.label).toBe('Start')
    })
  })

  describe('create', () => {
    it('creates a node with defaults', () => {
      const node = repo.create({ workflowId: wfId, type: 'trigger' })
      expect(node.id).toBeTruthy()
      expect(node.workflowId).toBe(wfId)
      expect(node.type).toBe('trigger')
      expect(node.label).toBe('')
      expect(node.x).toBe(0)
      expect(node.y).toBe(0)
      expect(node.config).toBe('{}')
      expect(node.createdAt).toBeGreaterThan(0)
    })

    it('creates a node with custom values', () => {
      const node = repo.create({
        workflowId: wfId,
        type: 'action',
        label: 'Send Email',
        x: 100,
        y: 200,
        config: '{"action":"email"}'
      })
      expect(node.label).toBe('Send Email')
      expect(node.x).toBe(100)
      expect(node.y).toBe(200)
      expect(node.config).toBe('{"action":"email"}')
    })
  })

  describe('update', () => {
    it('returns undefined for non-existent id', () => {
      expect(repo.update('non-existent', { label: 'X' })).toBeUndefined()
    })

    it('updates label only', () => {
      const node = repo.create({ workflowId: wfId, type: 'trigger' })
      const updated = repo.update(node.id, { label: 'New Label' })
      expect(updated!.label).toBe('New Label')
      expect(updated!.type).toBe('trigger')
    })

    it('updates position', () => {
      const node = repo.create({ workflowId: wfId, type: 'trigger', x: 0, y: 0 })
      const updated = repo.update(node.id, { x: 50, y: 75 })
      expect(updated!.x).toBe(50)
      expect(updated!.y).toBe(75)
    })

    it('updates config', () => {
      const node = repo.create({ workflowId: wfId, type: 'action' })
      const updated = repo.update(node.id, { config: '{"key":"val"}' })
      expect(updated!.config).toBe('{"key":"val"}')
    })

    it('updates updatedAt timestamp', () => {
      const node = repo.create({ workflowId: wfId, type: 'trigger' })
      const updated = repo.update(node.id, { label: 'Changed' })
      expect(updated!.updatedAt).toBeGreaterThanOrEqual(node.updatedAt)
    })

    it('persists changes', () => {
      const node = repo.create({ workflowId: wfId, type: 'trigger' })
      repo.update(node.id, { label: 'Persisted', x: 42 })
      const fetched = repo.get(node.id)
      expect(fetched!.label).toBe('Persisted')
      expect(fetched!.x).toBe(42)
    })
  })

  describe('delete', () => {
    it('returns false for non-existent id', () => {
      expect(repo.delete('non-existent')).toBe(false)
    })

    it('deletes a node and returns true', () => {
      const node = repo.create({ workflowId: wfId, type: 'trigger' })
      expect(repo.delete(node.id)).toBe(true)
      expect(repo.get(node.id)).toBeUndefined()
    })
  })

  describe('batchCreate', () => {
    it('creates multiple nodes in a transaction', () => {
      const nodes = repo.batchCreate([
        { workflowId: wfId, type: 'trigger', label: 'Start' },
        { workflowId: wfId, type: 'condition', label: 'Check' },
        { workflowId: wfId, type: 'action', label: 'Execute' }
      ])
      expect(nodes).toHaveLength(3)
      expect(nodes[0].label).toBe('Start')
      expect(nodes[1].label).toBe('Check')
      expect(nodes[2].label).toBe('Execute')
      expect(repo.listByWorkflow(wfId)).toHaveLength(3)
    })

    it('handles empty array', () => {
      const nodes = repo.batchCreate([])
      expect(nodes).toEqual([])
    })
  })

  describe('batchUpdate', () => {
    it('updates multiple nodes in a transaction', () => {
      const n1 = repo.create({ workflowId: wfId, type: 'trigger' })
      const n2 = repo.create({ workflowId: wfId, type: 'action' })
      const results = repo.batchUpdate([
        { id: n1.id, x: 10, y: 20 },
        { id: n2.id, label: 'Updated' }
      ])
      expect(results).toHaveLength(2)
      expect(results[0].x).toBe(10)
      expect(results[0].y).toBe(20)
      expect(results[1].label).toBe('Updated')
    })

    it('skips non-existent nodes', () => {
      const node = repo.create({ workflowId: wfId, type: 'trigger' })
      const results = repo.batchUpdate([
        { id: node.id, label: 'Real' },
        { id: 'non-existent', label: 'Ghost' }
      ])
      expect(results).toHaveLength(1)
      expect(results[0].label).toBe('Real')
    })

    it('handles empty array', () => {
      const results = repo.batchUpdate([])
      expect(results).toEqual([])
    })
  })
})
