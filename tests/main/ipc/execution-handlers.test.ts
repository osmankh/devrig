import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock ipc-security
// ---------------------------------------------------------------------------
const handlers: Record<string, Function> = {}

vi.mock('../../../src/main/ipc-security', () => ({
  secureHandle: vi.fn((channel: string, handler: Function) => {
    handlers[channel] = handler
  })
}))

// ---------------------------------------------------------------------------
// Mock services
// ---------------------------------------------------------------------------
const mockExecuteWorkflow = vi.fn()
const mockCancelExecution = vi.fn()
const mockValidateFlow = vi.fn()

vi.mock('../../../src/main/services/flow-executor', () => ({
  executeWorkflow: (...args: unknown[]) => mockExecuteWorkflow(...args),
  cancelExecution: (...args: unknown[]) => mockCancelExecution(...args)
}))

vi.mock('../../../src/main/services/flow-validator', () => ({
  validateFlow: (...args: unknown[]) => mockValidateFlow(...args)
}))

import { registerExecutionHandlers } from '../../../src/main/ipc/execution-handlers'

// ---------------------------------------------------------------------------
// Mock repos & window
// ---------------------------------------------------------------------------
function makeMockRepos() {
  return {
    workflow: {
      getWithNodes: vi.fn()
    },
    execution: {}
  }
}

describe('execution-handlers', () => {
  let repos: ReturnType<typeof makeMockRepos>
  const mockGetMainWindow = vi.fn(() => null)
  const evt = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(handlers).forEach((k) => delete handlers[k])
    repos = makeMockRepos()
    registerExecutionHandlers(repos as any, mockGetMainWindow as any)
  })

  // -----------------------------------------------------------------------
  // execution:validate
  // -----------------------------------------------------------------------
  describe('execution:validate', () => {
    it('validates a workflow successfully', () => {
      const flowData = { nodes: [{ id: 'n1' }], edges: [] }
      repos.workflow.getWithNodes.mockReturnValue(flowData)
      mockValidateFlow.mockReturnValue({ valid: true, errors: [] })

      const result = handlers['execution:validate'](evt, { workflowId: 'wf-1' })
      expect(result).toEqual({ data: { valid: true, errors: [] } })
      expect(repos.workflow.getWithNodes).toHaveBeenCalledWith('wf-1')
    })

    it('returns validation errors', () => {
      const flowData = { nodes: [], edges: [] }
      repos.workflow.getWithNodes.mockReturnValue(flowData)
      mockValidateFlow.mockReturnValue({
        valid: false,
        errors: [{ message: 'No nodes' }]
      })

      const result = handlers['execution:validate'](evt, { workflowId: 'wf-1' })
      expect(result.data.valid).toBe(false)
      expect(result.data.errors).toHaveLength(1)
    })

    it('rejects invalid input', () => {
      const result = handlers['execution:validate'](evt, { workflowId: 123 })
      expect(result).toEqual({ error: 'Invalid workflow id', code: 'VALIDATION' })
    })

    it('returns not-found for missing workflow', () => {
      repos.workflow.getWithNodes.mockReturnValue(undefined)
      const result = handlers['execution:validate'](evt, { workflowId: 'wf-x' })
      expect(result).toEqual({ error: 'Workflow not found', code: 'NOT_FOUND' })
    })

    it('catches errors from validateFlow', () => {
      repos.workflow.getWithNodes.mockReturnValue({ nodes: [], edges: [] })
      mockValidateFlow.mockImplementation(() => {
        throw new Error('Unexpected')
      })
      const result = handlers['execution:validate'](evt, { workflowId: 'wf-1' })
      expect(result).toEqual({ error: 'Unexpected', code: 'UNKNOWN' })
    })
  })

  // -----------------------------------------------------------------------
  // execution:run
  // -----------------------------------------------------------------------
  describe('execution:run', () => {
    it('executes a valid workflow', async () => {
      const flowData = { nodes: [{ id: 'n1', type: 'trigger' }], edges: [] }
      repos.workflow.getWithNodes.mockReturnValue(flowData)
      mockValidateFlow.mockReturnValue({ valid: true, errors: [] })
      mockExecuteWorkflow.mockResolvedValue({ executionId: 'ex-1' })

      const result = await handlers['execution:run'](evt, { workflowId: 'wf-1' })
      expect(result).toEqual({ data: { executionId: 'ex-1' } })
      expect(mockExecuteWorkflow).toHaveBeenCalledWith('wf-1', 'manual', repos, null)
    })

    it('rejects invalid input', async () => {
      const result = await handlers['execution:run'](evt, {})
      expect(result).toEqual({ error: 'Invalid workflow id', code: 'VALIDATION' })
    })

    it('returns not-found for missing workflow', async () => {
      repos.workflow.getWithNodes.mockReturnValue(undefined)
      const result = await handlers['execution:run'](evt, { workflowId: 'wf-x' })
      expect(result).toEqual({ error: 'Workflow not found', code: 'NOT_FOUND' })
    })

    it('returns validation errors when flow is invalid', async () => {
      repos.workflow.getWithNodes.mockReturnValue({ nodes: [], edges: [] })
      mockValidateFlow.mockReturnValue({
        valid: false,
        errors: [{ message: 'No trigger' }, { message: 'No actions' }]
      })

      const result = await handlers['execution:run'](evt, { workflowId: 'wf-1' })
      expect(result).toEqual({
        error: 'No trigger; No actions',
        code: 'FLOW_VALIDATION'
      })
    })

    it('catches execution errors', async () => {
      repos.workflow.getWithNodes.mockReturnValue({ nodes: [], edges: [] })
      mockValidateFlow.mockReturnValue({ valid: true, errors: [] })
      mockExecuteWorkflow.mockRejectedValue(new Error('Boom'))

      const result = await handlers['execution:run'](evt, { workflowId: 'wf-1' })
      expect(result).toEqual({ error: 'Boom', code: 'UNKNOWN' })
    })
  })

  // -----------------------------------------------------------------------
  // execution:cancel
  // -----------------------------------------------------------------------
  describe('execution:cancel', () => {
    it('cancels an execution', () => {
      mockCancelExecution.mockReturnValue(true)
      const result = handlers['execution:cancel'](evt, { executionId: 'ex-1' })
      expect(result).toEqual({ data: true })
      expect(mockCancelExecution).toHaveBeenCalledWith('ex-1')
    })

    it('returns false for unknown execution', () => {
      mockCancelExecution.mockReturnValue(false)
      const result = handlers['execution:cancel'](evt, { executionId: 'ex-x' })
      expect(result).toEqual({ data: false })
    })

    it('rejects invalid input', () => {
      const result = handlers['execution:cancel'](evt, { executionId: 123 })
      expect(result).toEqual({ error: 'Invalid execution id', code: 'VALIDATION' })
    })

    it('catches cancel errors', () => {
      mockCancelExecution.mockImplementation(() => {
        throw new Error('Cancel failed')
      })
      const result = handlers['execution:cancel'](evt, { executionId: 'ex-1' })
      expect(result).toEqual({ error: 'Cancel failed', code: 'UNKNOWN' })
    })
  })

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------
  it('registers all expected channels', () => {
    const channels = Object.keys(handlers)
    expect(channels).toContain('execution:validate')
    expect(channels).toContain('execution:run')
    expect(channels).toContain('execution:cancel')
  })
})
