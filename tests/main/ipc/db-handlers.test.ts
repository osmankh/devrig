import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock ipc-security — capture registered handlers
// ---------------------------------------------------------------------------
const handlers: Record<string, Function> = {}

vi.mock('../../../src/main/ipc-security', () => ({
  secureHandle: vi.fn((channel: string, handler: Function) => {
    handlers[channel] = handler
  })
}))

import { registerDbHandlers } from '../../../src/main/ipc/db-handlers'

// ---------------------------------------------------------------------------
// Mock repositories
// ---------------------------------------------------------------------------
function makeMockRepos() {
  return {
    workspace: {
      list: vi.fn(() => []),
      get: vi.fn(),
      create: vi.fn((data: unknown) => ({ id: 'ws-1', ...data as object })),
      update: vi.fn()
    },
    workflow: {
      list: vi.fn(() => []),
      get: vi.fn(),
      getWithNodes: vi.fn(),
      create: vi.fn((data: unknown) => ({ id: 'wf-1', ...data as object })),
      update: vi.fn(),
      delete: vi.fn(() => true)
    },
    node: {
      create: vi.fn((data: unknown) => ({ id: 'n-1', ...data as object })),
      update: vi.fn(),
      delete: vi.fn(() => true),
      batchCreate: vi.fn((items: unknown[]) => items),
      batchUpdate: vi.fn((items: unknown[]) => items)
    },
    edge: {
      create: vi.fn((data: unknown) => ({ id: 'e-1', ...data as object })),
      delete: vi.fn(() => true),
      deleteByWorkflow: vi.fn(() => 3),
      batchCreate: vi.fn((items: unknown[]) => items)
    },
    execution: {
      list: vi.fn(() => []),
      get: vi.fn(),
      getWithSteps: vi.fn(),
      create: vi.fn((data: unknown) => ({ id: 'ex-1', ...data as object })),
      update: vi.fn()
    },
    settings: {
      get: vi.fn(),
      set: vi.fn()
    }
  }
}

describe('db-handlers', () => {
  let repos: ReturnType<typeof makeMockRepos>
  const evt = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(handlers).forEach((k) => delete handlers[k])
    repos = makeMockRepos()
    registerDbHandlers(repos as any)
  })

  // -----------------------------------------------------------------------
  // Workspace handlers
  // -----------------------------------------------------------------------
  describe('workspace', () => {
    it('db:workspace:list returns ok with data', () => {
      repos.workspace.list.mockReturnValue([{ id: '1', name: 'Test' }])
      const result = handlers['db:workspace:list'](evt)
      expect(result).toEqual({ data: [{ id: '1', name: 'Test' }] })
    })

    it('db:workspace:get returns workspace', () => {
      repos.workspace.get.mockReturnValue({ id: 'ws-1', name: 'My WS' })
      const result = handlers['db:workspace:get'](evt, 'ws-1')
      expect(result).toEqual({ data: { id: 'ws-1', name: 'My WS' } })
      expect(repos.workspace.get).toHaveBeenCalledWith('ws-1')
    })

    it('db:workspace:get rejects non-string id', () => {
      const result = handlers['db:workspace:get'](evt, 123)
      expect(result).toEqual({ error: 'Invalid workspace id', code: 'VALIDATION' })
    })

    it('db:workspace:get returns not-found for missing workspace', () => {
      repos.workspace.get.mockReturnValue(undefined)
      const result = handlers['db:workspace:get'](evt, 'missing')
      expect(result).toEqual({ error: 'Workspace not found', code: 'NOT_FOUND' })
    })

    it('db:workspace:create creates workspace with valid data', () => {
      const result = handlers['db:workspace:create'](evt, { name: 'New WS' })
      expect(result.data).toBeDefined()
      expect(repos.workspace.create).toHaveBeenCalledWith({ name: 'New WS' })
    })

    it('db:workspace:create rejects empty name', () => {
      const result = handlers['db:workspace:create'](evt, { name: '' })
      expect(result).toEqual({ error: 'Invalid workspace data', code: 'VALIDATION' })
    })

    it('db:workspace:create rejects missing data', () => {
      const result = handlers['db:workspace:create'](evt, undefined)
      expect(result).toEqual({ error: 'Invalid workspace data', code: 'VALIDATION' })
    })

    it('db:workspace:update updates workspace', () => {
      repos.workspace.update.mockReturnValue({ id: 'ws-1', name: 'Updated' })
      const result = handlers['db:workspace:update'](evt, 'ws-1', { name: 'Updated' })
      expect(result).toEqual({ data: { id: 'ws-1', name: 'Updated' } })
    })

    it('db:workspace:update rejects invalid id', () => {
      const result = handlers['db:workspace:update'](evt, 123, { name: 'X' })
      expect(result).toEqual({ error: 'Invalid data', code: 'VALIDATION' })
    })

    it('db:workspace:update returns not-found', () => {
      repos.workspace.update.mockReturnValue(undefined)
      const result = handlers['db:workspace:update'](evt, 'ws-1', { name: 'X' })
      expect(result).toEqual({ error: 'Workspace not found', code: 'NOT_FOUND' })
    })
  })

  // -----------------------------------------------------------------------
  // Workflow handlers
  // -----------------------------------------------------------------------
  describe('workflow', () => {
    it('db:workflow:list returns list with default pagination', () => {
      repos.workflow.list.mockReturnValue([{ id: 'wf-1' }])
      const result = handlers['db:workflow:list'](evt, 'ws-1')
      expect(result).toEqual({ data: [{ id: 'wf-1' }] })
      expect(repos.workflow.list).toHaveBeenCalledWith('ws-1', 50, 0)
    })

    it('db:workflow:list uses custom limit and offset', () => {
      repos.workflow.list.mockReturnValue([])
      handlers['db:workflow:list'](evt, 'ws-1', 10, 20)
      expect(repos.workflow.list).toHaveBeenCalledWith('ws-1', 10, 20)
    })

    it('db:workflow:list rejects non-string workspace id', () => {
      const result = handlers['db:workflow:list'](evt, 999)
      expect(result).toEqual({ error: 'Invalid workspace id', code: 'VALIDATION' })
    })

    it('db:workflow:get returns workflow', () => {
      repos.workflow.get.mockReturnValue({ id: 'wf-1', name: 'Flow' })
      const result = handlers['db:workflow:get'](evt, 'wf-1')
      expect(result).toEqual({ data: { id: 'wf-1', name: 'Flow' } })
    })

    it('db:workflow:get rejects invalid id', () => {
      const result = handlers['db:workflow:get'](evt, null)
      expect(result).toEqual({ error: 'Invalid workflow id', code: 'VALIDATION' })
    })

    it('db:workflow:get returns not-found', () => {
      repos.workflow.get.mockReturnValue(undefined)
      const result = handlers['db:workflow:get'](evt, 'wf-x')
      expect(result).toEqual({ error: 'Workflow not found', code: 'NOT_FOUND' })
    })

    it('db:workflow:getWithNodes returns workflow with nodes', () => {
      const data = { id: 'wf-1', nodes: [], edges: [] }
      repos.workflow.getWithNodes.mockReturnValue(data)
      const result = handlers['db:workflow:getWithNodes'](evt, 'wf-1')
      expect(result).toEqual({ data })
    })

    it('db:workflow:getWithNodes returns not-found', () => {
      repos.workflow.getWithNodes.mockReturnValue(undefined)
      const result = handlers['db:workflow:getWithNodes'](evt, 'wf-x')
      expect(result).toEqual({ error: 'Workflow not found', code: 'NOT_FOUND' })
    })

    it('db:workflow:create creates with valid data', () => {
      const data = { workspaceId: 'ws-1', name: 'New Flow' }
      const result = handlers['db:workflow:create'](evt, data)
      expect(result.data).toBeDefined()
      expect(repos.workflow.create).toHaveBeenCalledWith(data)
    })

    it('db:workflow:create rejects missing name', () => {
      const result = handlers['db:workflow:create'](evt, { workspaceId: 'ws-1' })
      expect(result).toEqual({ error: 'Invalid workflow data', code: 'VALIDATION' })
    })

    it('db:workflow:update updates workflow', () => {
      repos.workflow.update.mockReturnValue({ id: 'wf-1', name: 'Updated' })
      const result = handlers['db:workflow:update'](evt, 'wf-1', { name: 'Updated' })
      expect(result).toEqual({ data: { id: 'wf-1', name: 'Updated' } })
    })

    it('db:workflow:update rejects invalid data', () => {
      const result = handlers['db:workflow:update'](evt, 123, { name: 'X' })
      expect(result).toEqual({ error: 'Invalid data', code: 'VALIDATION' })
    })

    it('db:workflow:update returns not-found', () => {
      repos.workflow.update.mockReturnValue(undefined)
      const result = handlers['db:workflow:update'](evt, 'wf-1', { name: 'X' })
      expect(result).toEqual({ error: 'Workflow not found', code: 'NOT_FOUND' })
    })

    it('db:workflow:delete deletes workflow', () => {
      repos.workflow.delete.mockReturnValue(true)
      const result = handlers['db:workflow:delete'](evt, 'wf-1')
      expect(result).toEqual({ data: true })
    })

    it('db:workflow:delete rejects invalid id', () => {
      const result = handlers['db:workflow:delete'](evt, 42)
      expect(result).toEqual({ error: 'Invalid workflow id', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // Node handlers
  // -----------------------------------------------------------------------
  describe('node', () => {
    it('db:node:create creates node', () => {
      const data = { workflowId: 'wf-1', type: 'action' }
      const result = handlers['db:node:create'](evt, data)
      expect(result.data).toBeDefined()
      expect(repos.node.create).toHaveBeenCalledWith(data)
    })

    it('db:node:create rejects missing type', () => {
      const result = handlers['db:node:create'](evt, { workflowId: 'wf-1' })
      expect(result).toEqual({ error: 'Invalid node data', code: 'VALIDATION' })
    })

    it('db:node:update updates node', () => {
      repos.node.update.mockReturnValue({ id: 'n-1', label: 'Updated' })
      const result = handlers['db:node:update'](evt, 'n-1', { label: 'Updated' })
      expect(result).toEqual({ data: { id: 'n-1', label: 'Updated' } })
    })

    it('db:node:update rejects invalid id', () => {
      const result = handlers['db:node:update'](evt, null, { label: 'X' })
      expect(result).toEqual({ error: 'Invalid data', code: 'VALIDATION' })
    })

    it('db:node:update returns not-found', () => {
      repos.node.update.mockReturnValue(undefined)
      const result = handlers['db:node:update'](evt, 'n-1', { label: 'X' })
      expect(result).toEqual({ error: 'Node not found', code: 'NOT_FOUND' })
    })

    it('db:node:delete deletes node', () => {
      const result = handlers['db:node:delete'](evt, 'n-1')
      expect(result).toEqual({ data: true })
    })

    it('db:node:delete rejects invalid id', () => {
      const result = handlers['db:node:delete'](evt, undefined)
      expect(result).toEqual({ error: 'Invalid node id', code: 'VALIDATION' })
    })

    it('db:node:batchCreate creates multiple nodes', () => {
      const nodes = [
        { workflowId: 'wf-1', type: 'action' },
        { workflowId: 'wf-1', type: 'condition' }
      ]
      const result = handlers['db:node:batchCreate'](evt, nodes)
      expect(result.data).toHaveLength(2)
    })

    it('db:node:batchCreate rejects invalid data', () => {
      const result = handlers['db:node:batchCreate'](evt, 'not-array')
      expect(result).toEqual({ error: 'Invalid nodes data', code: 'VALIDATION' })
    })

    it('db:node:batchUpdate updates multiple nodes', () => {
      const updates = [
        { id: 'n-1', label: 'A' },
        { id: 'n-2', x: 100 }
      ]
      const result = handlers['db:node:batchUpdate'](evt, updates)
      expect(result.data).toHaveLength(2)
    })

    it('db:node:batchUpdate rejects invalid data', () => {
      const result = handlers['db:node:batchUpdate'](evt, { bad: true })
      expect(result).toEqual({ error: 'Invalid updates data', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // Edge handlers
  // -----------------------------------------------------------------------
  describe('edge', () => {
    it('db:edge:create creates edge', () => {
      const data = { workflowId: 'wf-1', sourceNodeId: 'n-1', targetNodeId: 'n-2' }
      const result = handlers['db:edge:create'](evt, data)
      expect(result.data).toBeDefined()
      expect(repos.edge.create).toHaveBeenCalledWith(data)
    })

    it('db:edge:create rejects missing fields', () => {
      const result = handlers['db:edge:create'](evt, { workflowId: 'wf-1' })
      expect(result).toEqual({ error: 'Invalid edge data', code: 'VALIDATION' })
    })

    it('db:edge:delete deletes edge', () => {
      const result = handlers['db:edge:delete'](evt, 'e-1')
      expect(result).toEqual({ data: true })
    })

    it('db:edge:delete rejects invalid id', () => {
      const result = handlers['db:edge:delete'](evt, 123)
      expect(result).toEqual({ error: 'Invalid edge id', code: 'VALIDATION' })
    })

    it('db:edge:deleteByWorkflow deletes edges by workflow', () => {
      repos.edge.deleteByWorkflow.mockReturnValue(5)
      const result = handlers['db:edge:deleteByWorkflow'](evt, 'wf-1')
      expect(result).toEqual({ data: 5 })
    })

    it('db:edge:deleteByWorkflow rejects invalid id', () => {
      const result = handlers['db:edge:deleteByWorkflow'](evt, null)
      expect(result).toEqual({ error: 'Invalid workflow id', code: 'VALIDATION' })
    })

    it('db:edge:batchCreate creates multiple edges', () => {
      const edges = [
        { workflowId: 'wf-1', sourceNodeId: 'n-1', targetNodeId: 'n-2' },
        { workflowId: 'wf-1', sourceNodeId: 'n-2', targetNodeId: 'n-3' }
      ]
      const result = handlers['db:edge:batchCreate'](evt, edges)
      expect(result.data).toHaveLength(2)
    })

    it('db:edge:batchCreate rejects invalid data', () => {
      const result = handlers['db:edge:batchCreate'](evt, 'bad')
      expect(result).toEqual({ error: 'Invalid edges data', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // Execution handlers
  // -----------------------------------------------------------------------
  describe('execution', () => {
    it('db:execution:list returns list with defaults', () => {
      repos.execution.list.mockReturnValue([{ id: 'ex-1' }])
      const result = handlers['db:execution:list'](evt, 'wf-1')
      expect(result).toEqual({ data: [{ id: 'ex-1' }] })
      expect(repos.execution.list).toHaveBeenCalledWith('wf-1', 50, 0)
    })

    it('db:execution:list uses custom limit/offset', () => {
      handlers['db:execution:list'](evt, 'wf-1', 5, 10)
      expect(repos.execution.list).toHaveBeenCalledWith('wf-1', 5, 10)
    })

    it('db:execution:list rejects invalid workflow id', () => {
      const result = handlers['db:execution:list'](evt, 100)
      expect(result).toEqual({ error: 'Invalid workflow id', code: 'VALIDATION' })
    })

    it('db:execution:create creates execution', () => {
      const data = { workflowId: 'wf-1', triggerType: 'manual' }
      const result = handlers['db:execution:create'](evt, data)
      expect(result.data).toBeDefined()
    })

    it('db:execution:create rejects missing fields', () => {
      const result = handlers['db:execution:create'](evt, { workflowId: 'wf-1' })
      expect(result).toEqual({ error: 'Invalid execution data', code: 'VALIDATION' })
    })

    it('db:execution:update updates execution', () => {
      repos.execution.update.mockReturnValue({ id: 'ex-1', status: 'success' })
      const result = handlers['db:execution:update'](evt, 'ex-1', { status: 'success' })
      expect(result).toEqual({ data: { id: 'ex-1', status: 'success' } })
    })

    it('db:execution:update rejects invalid data', () => {
      const result = handlers['db:execution:update'](evt, null, { status: 'x' })
      expect(result).toEqual({ error: 'Invalid data', code: 'VALIDATION' })
    })

    it('db:execution:update returns not-found', () => {
      repos.execution.update.mockReturnValue(undefined)
      const result = handlers['db:execution:update'](evt, 'ex-1', { status: 'x' })
      expect(result).toEqual({ error: 'Execution not found', code: 'NOT_FOUND' })
    })

    it('db:execution:get returns execution', () => {
      repos.execution.get.mockReturnValue({ id: 'ex-1' })
      const result = handlers['db:execution:get'](evt, 'ex-1')
      expect(result).toEqual({ data: { id: 'ex-1' } })
    })

    it('db:execution:get returns not-found', () => {
      repos.execution.get.mockReturnValue(undefined)
      const result = handlers['db:execution:get'](evt, 'ex-x')
      expect(result).toEqual({ error: 'Execution not found', code: 'NOT_FOUND' })
    })

    it('db:execution:getWithSteps returns execution with steps', () => {
      const data = { id: 'ex-1', steps: [] }
      repos.execution.getWithSteps.mockReturnValue(data)
      const result = handlers['db:execution:getWithSteps'](evt, 'ex-1')
      expect(result).toEqual({ data })
    })

    it('db:execution:getWithSteps returns not-found', () => {
      repos.execution.getWithSteps.mockReturnValue(undefined)
      const result = handlers['db:execution:getWithSteps'](evt, 'ex-x')
      expect(result).toEqual({ error: 'Execution not found', code: 'NOT_FOUND' })
    })
  })

  // -----------------------------------------------------------------------
  // Settings handlers
  // -----------------------------------------------------------------------
  describe('settings', () => {
    it('db:settings:get returns setting value', () => {
      repos.settings.get.mockReturnValue('dark')
      const result = handlers['db:settings:get'](evt, 'theme')
      expect(result).toEqual({ data: 'dark' })
    })

    it('db:settings:get returns null for missing key', () => {
      repos.settings.get.mockReturnValue(undefined)
      const result = handlers['db:settings:get'](evt, 'missing')
      expect(result).toEqual({ data: null })
    })

    it('db:settings:get rejects non-string key', () => {
      const result = handlers['db:settings:get'](evt, 42)
      expect(result).toEqual({ error: 'Invalid key', code: 'VALIDATION' })
    })

    it('db:settings:set stores value', () => {
      const result = handlers['db:settings:set'](evt, 'theme', 'dark')
      expect(result).toEqual({ data: true })
      expect(repos.settings.set).toHaveBeenCalledWith('theme', 'dark')
    })

    it('db:settings:set rejects non-string value', () => {
      const result = handlers['db:settings:set'](evt, 'theme', 123)
      expect(result).toEqual({ error: 'Invalid data', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------
  it('registers all expected channels', () => {
    const channels = Object.keys(handlers)
    expect(channels).toContain('db:workspace:list')
    expect(channels).toContain('db:workspace:get')
    expect(channels).toContain('db:workspace:create')
    expect(channels).toContain('db:workspace:update')
    expect(channels).toContain('db:workflow:list')
    expect(channels).toContain('db:workflow:get')
    expect(channels).toContain('db:workflow:getWithNodes')
    expect(channels).toContain('db:workflow:create')
    expect(channels).toContain('db:workflow:update')
    expect(channels).toContain('db:workflow:delete')
    expect(channels).toContain('db:node:create')
    expect(channels).toContain('db:node:update')
    expect(channels).toContain('db:node:delete')
    expect(channels).toContain('db:node:batchCreate')
    expect(channels).toContain('db:node:batchUpdate')
    expect(channels).toContain('db:edge:create')
    expect(channels).toContain('db:edge:delete')
    expect(channels).toContain('db:edge:deleteByWorkflow')
    expect(channels).toContain('db:edge:batchCreate')
    expect(channels).toContain('db:execution:list')
    expect(channels).toContain('db:execution:create')
    expect(channels).toContain('db:execution:update')
    expect(channels).toContain('db:execution:get')
    expect(channels).toContain('db:execution:getWithSteps')
    expect(channels).toContain('db:settings:get')
    expect(channels).toContain('db:settings:set')
  })
})
