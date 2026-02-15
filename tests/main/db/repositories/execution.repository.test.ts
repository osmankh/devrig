import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { createTestDb, seedWorkflow } from '../../../helpers/test-db'
import { ExecutionRepository } from '../../../../src/main/db/repositories/execution.repository'

describe('ExecutionRepository', () => {
  let db: ReturnType<typeof createTestDb>
  let repo: ExecutionRepository

  beforeEach(() => {
    db = createTestDb()
    repo = new ExecutionRepository(db)
    seedWorkflow(db, 'wf-1')
  })
  afterEach(() => { db.close() })

  // ── create ──────────────────────────────────────────────
  describe('create()', () => {
    it('creates an execution with default status', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      expect(exec.id).toBeTypeOf('string')
      expect(exec.workflowId).toBe('wf-1')
      expect(exec.triggerType).toBe('manual')
      expect(exec.status).toBe('pending')
      expect(exec.startedAt).toBeNull()
      expect(exec.completedAt).toBeNull()
      expect(exec.error).toBeNull()
      expect(exec.createdAt).toBeTypeOf('number')
    })

    it('creates an execution with explicit status', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'cron', status: 'running' })
      expect(exec.status).toBe('running')
    })
  })

  // ── get ─────────────────────────────────────────────────
  describe('get()', () => {
    it('returns an execution by id', () => {
      const created = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      const found = repo.get(created.id)
      expect(found).toBeDefined()
      expect(found!.id).toBe(created.id)
      expect(found!.workflowId).toBe('wf-1')
    })

    it('returns undefined for unknown id', () => {
      expect(repo.get('nonexistent')).toBeUndefined()
    })
  })

  // ── list ────────────────────────────────────────────────
  describe('list()', () => {
    it('lists executions for a workflow', () => {
      repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      repo.create({ workflowId: 'wf-1', triggerType: 'cron' })
      const results = repo.list('wf-1')
      expect(results).toHaveLength(2)
    })

    it('returns empty for unknown workflow', () => {
      expect(repo.list('unknown')).toHaveLength(0)
    })

    it('respects limit and offset', () => {
      for (let i = 0; i < 5; i++) {
        repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      }
      expect(repo.list('wf-1', 2)).toHaveLength(2)
      expect(repo.list('wf-1', 10, 3)).toHaveLength(2)
    })
  })

  // ── update ──────────────────────────────────────────────
  describe('update()', () => {
    it('updates execution fields', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      const now = Date.now()
      const updated = repo.update(exec.id, {
        status: 'running',
        startedAt: now
      })
      expect(updated).toBeDefined()
      expect(updated!.status).toBe('running')
      expect(updated!.startedAt).toBe(now)
    })

    it('can set error and completedAt', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      const now = Date.now()
      const updated = repo.update(exec.id, {
        status: 'failed',
        completedAt: now,
        error: 'Something broke'
      })
      expect(updated!.status).toBe('failed')
      expect(updated!.error).toBe('Something broke')
      expect(updated!.completedAt).toBe(now)
    })

    it('can clear error by setting null', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      repo.update(exec.id, { error: 'oops' })
      const cleared = repo.update(exec.id, { error: null })
      expect(cleared!.error).toBeNull()
    })

    it('returns undefined for unknown id', () => {
      expect(repo.update('nonexistent', { status: 'done' })).toBeUndefined()
    })
  })

  // ── createStep ──────────────────────────────────────────
  describe('createStep()', () => {
    it('creates an execution step', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      const step = repo.createStep({
        executionId: exec.id,
        nodeId: 'node-1',
        status: 'pending'
      })
      expect(step.id).toBeTypeOf('string')
      expect(step.executionId).toBe(exec.id)
      expect(step.nodeId).toBe('node-1')
      expect(step.status).toBe('pending')
      expect(step.input).toBeNull()
      expect(step.output).toBeNull()
      expect(step.error).toBeNull()
    })
  })

  // ── updateStep ──────────────────────────────────────────
  describe('updateStep()', () => {
    it('updates step fields', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      const step = repo.createStep({ executionId: exec.id, nodeId: 'node-1', status: 'pending' })
      const now = Date.now()
      const updated = repo.updateStep(step.id, {
        status: 'completed',
        input: '{"key":"val"}',
        output: '{"result":true}',
        startedAt: now,
        completedAt: now + 100,
        durationMs: 100
      })
      expect(updated).toBeDefined()
      expect(updated!.status).toBe('completed')
      expect(updated!.input).toBe('{"key":"val"}')
      expect(updated!.output).toBe('{"result":true}')
      expect(updated!.durationMs).toBe(100)
    })

    it('can set error on step', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      const step = repo.createStep({ executionId: exec.id, nodeId: 'n1', status: 'running' })
      const updated = repo.updateStep(step.id, { status: 'failed', error: 'timeout' })
      expect(updated!.error).toBe('timeout')
    })

    it('returns undefined for unknown id', () => {
      expect(repo.updateStep('nonexistent', { status: 'done' })).toBeUndefined()
    })
  })

  // ── listSteps ───────────────────────────────────────────
  describe('listSteps()', () => {
    it('lists steps for an execution', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      repo.createStep({ executionId: exec.id, nodeId: 'n1', status: 'completed' })
      repo.createStep({ executionId: exec.id, nodeId: 'n2', status: 'pending' })
      const steps = repo.listSteps(exec.id)
      expect(steps).toHaveLength(2)
    })

    it('returns empty for unknown execution', () => {
      expect(repo.listSteps('unknown')).toHaveLength(0)
    })
  })

  // ── getWithSteps ────────────────────────────────────────
  describe('getWithSteps()', () => {
    it('returns execution with its steps', () => {
      const exec = repo.create({ workflowId: 'wf-1', triggerType: 'manual' })
      repo.createStep({ executionId: exec.id, nodeId: 'n1', status: 'completed' })
      repo.createStep({ executionId: exec.id, nodeId: 'n2', status: 'pending' })

      const result = repo.getWithSteps(exec.id)
      expect(result).toBeDefined()
      expect(result!.execution.id).toBe(exec.id)
      expect(result!.steps).toHaveLength(2)
    })

    it('returns undefined for unknown id', () => {
      expect(repo.getWithSteps('nonexistent')).toBeUndefined()
    })
  })
})
