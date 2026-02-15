import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock the actions module before importing flow-executor
vi.mock('../../../src/main/services/actions', () => ({
  executeAction: vi.fn(),
}))

// Mock condition-engine
vi.mock('../../../src/main/services/condition-engine', () => ({
  evaluateCondition: vi.fn(),
}))

import { executeWorkflow, cancelExecution } from '../../../src/main/services/flow-executor'
import { executeAction } from '../../../src/main/services/actions'
import { evaluateCondition } from '../../../src/main/services/condition-engine'
import type { FlowNode, FlowEdge } from '../../../src/main/db/schema'

const mockedExecuteAction = vi.mocked(executeAction)
const mockedEvaluateCondition = vi.mocked(evaluateCondition)

const now = Date.now()

function makeNode(overrides: Partial<FlowNode> & { id: string; type: string }): FlowNode {
  return {
    workflowId: 'wf-1',
    label: overrides.label ?? overrides.type,
    x: 0,
    y: 0,
    config: '{}',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  }
}

function makeEdge(source: string, target: string, overrides?: Partial<FlowEdge>): FlowEdge {
  return {
    id: `edge-${source}-${target}`,
    workflowId: 'wf-1',
    sourceNodeId: source,
    targetNodeId: target,
    sourceHandle: null,
    targetHandle: null,
    label: '',
    createdAt: now,
    ...overrides,
  }
}

function makeMockRepos() {
  const steps: Record<string, any> = {}
  let stepCounter = 0
  return {
    workflow: {
      getWithNodes: vi.fn(),
    },
    execution: {
      create: vi.fn().mockReturnValue({ id: 'exec-1' }),
      update: vi.fn(),
      createStep: vi.fn().mockImplementation(() => {
        const id = `step-${++stepCounter}`
        steps[id] = { id }
        return { id }
      }),
      updateStep: vi.fn(),
    },
    _steps: steps,
    _resetStepCounter: () => { stepCounter = 0 },
  }
}

function makeMockWindow() {
  return {
    webContents: {
      send: vi.fn(),
    },
  } as any
}

describe('flow-executor', () => {
  let repos: ReturnType<typeof makeMockRepos>
  let mainWindow: ReturnType<typeof makeMockWindow>

  beforeEach(() => {
    vi.clearAllMocks()
    repos = makeMockRepos()
    mainWindow = makeMockWindow()
    mockedExecuteAction.mockResolvedValue({ success: true, output: { result: 'ok' } })
    mockedEvaluateCondition.mockReturnValue(true)
  })

  describe('executeWorkflow', () => {
    it('throws if workflow not found', async () => {
      repos.workflow.getWithNodes.mockReturnValue(null)
      await expect(executeWorkflow('wf-missing', 'manual', repos as any, mainWindow)).rejects.toThrow(
        'Workflow not found: wf-missing',
      )
    })

    it('executes a simple trigger → action flow', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const action = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'echo hi' } }),
      })
      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, action],
        edges: [makeEdge('t1', 'a1')],
      })

      const result = await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      expect(result.executionId).toBe('exec-1')
      expect(repos.execution.create).toHaveBeenCalledWith({
        workflowId: 'wf-1',
        triggerType: 'manual',
        status: 'running',
      })
      expect(repos.execution.update).toHaveBeenCalledWith('exec-1', expect.objectContaining({ status: 'success' }))
      expect(mockedExecuteAction).toHaveBeenCalledWith('shell.exec', { command: 'echo hi' })
    })

    it('stops on first action failure', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const a1 = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'fail' } }),
      })
      const a2 = makeNode({
        id: 'a2',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'echo' } }),
      })

      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, a1, a2],
        edges: [makeEdge('t1', 'a1'), makeEdge('a1', 'a2')],
      })

      mockedExecuteAction.mockResolvedValueOnce({ success: false, output: 'command failed' })

      const result = await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      expect(result.executionId).toBe('exec-1')
      expect(repos.execution.update).toHaveBeenCalledWith(
        'exec-1',
        expect.objectContaining({ status: 'failed' }),
      )
      // Should only call action once (first node), not reach a2
      expect(mockedExecuteAction).toHaveBeenCalledTimes(1)
    })

    it('handles condition node branching (true path)', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const condition = makeNode({
        id: 'c1',
        type: 'condition',
        config: JSON.stringify({ condition: { type: 'compare', left: { type: 'literal', value: 1 }, operator: 'eq', right: { type: 'literal', value: 1 } } }),
      })
      const trueAction = makeNode({
        id: 'a-true',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'echo true' } }),
      })
      const falseAction = makeNode({
        id: 'a-false',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'echo false' } }),
      })

      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, condition, trueAction, falseAction],
        edges: [
          makeEdge('t1', 'c1'),
          makeEdge('c1', 'a-true', { label: 'true' }),
          makeEdge('c1', 'a-false', { label: 'false' }),
        ],
      })

      mockedEvaluateCondition.mockReturnValue(true)

      await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      // True path action should execute, false path should be skipped
      expect(mockedExecuteAction).toHaveBeenCalledWith('shell.exec', { command: 'echo true' })
      // false branch skipped
      expect(repos.execution.updateStep).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ status: 'skipped' }),
      )
    })

    it('handles condition node branching (false path)', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const condition = makeNode({
        id: 'c1',
        type: 'condition',
        config: JSON.stringify({ condition: {} }),
      })
      const trueAction = makeNode({
        id: 'a-true',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'echo true' } }),
      })
      const falseAction = makeNode({
        id: 'a-false',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'echo false' } }),
      })

      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, condition, trueAction, falseAction],
        edges: [
          makeEdge('t1', 'c1'),
          makeEdge('c1', 'a-true', { label: 'true' }),
          makeEdge('c1', 'a-false', { label: 'false' }),
        ],
      })

      mockedEvaluateCondition.mockReturnValue(false)

      await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      // False path action should execute, true path should be skipped
      expect(mockedExecuteAction).toHaveBeenCalledWith('shell.exec', { command: 'echo false' })
    })

    it('throws on cyclic graph', async () => {
      const a1 = makeNode({ id: 'a1', type: 'action' })
      const a2 = makeNode({ id: 'a2', type: 'action' })
      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [a1, a2],
        edges: [makeEdge('a1', 'a2'), makeEdge('a2', 'a1')],
      })

      await expect(executeWorkflow('wf-1', 'manual', repos as any, mainWindow)).rejects.toThrow('cycle')
    })

    it('sends IPC events to mainWindow', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const action = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'test' } }),
      })
      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, action],
        edges: [makeEdge('t1', 'a1')],
      })

      await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      const sentEvents = mainWindow.webContents.send.mock.calls.map((c: any[]) => c[0])
      expect(sentEvents).toContain('execution:step-update')
      expect(sentEvents).toContain('execution:complete')
    })

    it('works with null mainWindow', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const action = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'test' } }),
      })
      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, action],
        edges: [makeEdge('t1', 'a1')],
      })

      // Should not throw with null mainWindow
      const result = await executeWorkflow('wf-1', 'manual', repos as any, null)
      expect(result.executionId).toBe('exec-1')
    })

    it('records trigger output in context', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const action = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: '{{nodes.t1.output.type}}' } }),
      })
      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, action],
        edges: [makeEdge('t1', 'a1')],
      })

      await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      // The interpolated command should resolve {{nodes.t1.output.type}} to 'manual'
      expect(mockedExecuteAction).toHaveBeenCalledWith('shell.exec', { command: 'manual' })
    })

    it('handles action with no config gracefully', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const action = makeNode({
        id: 'a1',
        type: 'action',
        config: null,
      })
      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, action],
        edges: [makeEdge('t1', 'a1')],
      })

      // executeAction for undefined actionType
      mockedExecuteAction.mockResolvedValue({ success: true, output: {} })

      const result = await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)
      expect(result.executionId).toBe('exec-1')
    })
  })

  describe('cancelExecution', () => {
    it('returns false for unknown execution', () => {
      expect(cancelExecution('nonexistent')).toBe(false)
    })

    it('cancels a running execution', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      // Create a slow action that we can cancel during
      const action = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'sleep 10' } }),
      })
      const action2 = makeNode({
        id: 'a2',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'echo done' } }),
      })

      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, action, action2],
        edges: [makeEdge('t1', 'a1'), makeEdge('a1', 'a2')],
      })

      // Make first action take a while, cancel during it
      mockedExecuteAction.mockImplementation(async () => {
        // Cancel during execution
        cancelExecution('exec-1')
        return { success: true, output: {} }
      })

      const result = await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)
      expect(result.executionId).toBe('exec-1')

      // Should be marked as cancelled
      expect(repos.execution.update).toHaveBeenCalledWith(
        'exec-1',
        expect.objectContaining({ status: 'cancelled' }),
      )
    })
  })

  describe('interpolateTemplate (tested through executeWorkflow)', () => {
    it('interpolates nested object references', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const action = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({
          actionType: 'shell.exec',
          config: { command: 'echo {{nodes.t1.output.triggered}}' },
        }),
      })
      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, action],
        edges: [makeEdge('t1', 'a1')],
      })

      await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      expect(mockedExecuteAction).toHaveBeenCalledWith('shell.exec', { command: 'echo true' })
    })

    it('returns empty string for missing context paths', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const action = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({
          actionType: 'shell.exec',
          config: { command: 'echo {{nodes.missing.output.value}}' },
        }),
      })
      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, action],
        edges: [makeEdge('t1', 'a1')],
      })

      await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      expect(mockedExecuteAction).toHaveBeenCalledWith('shell.exec', { command: 'echo ' })
    })

    it('serializes object values as JSON', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const a1 = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({ actionType: 'shell.exec', config: { command: 'step1' } }),
      })
      const a2 = makeNode({
        id: 'a2',
        type: 'action',
        config: JSON.stringify({
          actionType: 'shell.exec',
          config: { command: 'echo {{nodes.a1.output}}' },
        }),
      })

      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, a1, a2],
        edges: [makeEdge('t1', 'a1'), makeEdge('a1', 'a2')],
      })

      // a1 returns an object
      mockedExecuteAction
        .mockResolvedValueOnce({ success: true, output: { data: 'test' } })
        .mockResolvedValueOnce({ success: true, output: {} })

      await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      // The second call should have the JSON-serialized output
      expect(mockedExecuteAction.mock.calls[1][1]).toEqual({
        command: 'echo {"data":"test"}',
      })
    })

    it('deeply interpolates nested config objects', async () => {
      const trigger = makeNode({ id: 't1', type: 'trigger' })
      const action = makeNode({
        id: 'a1',
        type: 'action',
        config: JSON.stringify({
          actionType: 'http.request',
          config: {
            url: 'https://api.example.com/{{trigger.type}}',
            headers: {
              'X-Trigger': '{{trigger.type}}',
            },
          },
        }),
      })
      repos.workflow.getWithNodes.mockReturnValue({
        nodes: [trigger, action],
        edges: [makeEdge('t1', 'a1')],
      })

      await executeWorkflow('wf-1', 'manual', repos as any, mainWindow)

      expect(mockedExecuteAction).toHaveBeenCalledWith('http.request', {
        url: 'https://api.example.com/manual',
        headers: { 'X-Trigger': 'manual' },
      })
    })
  })
})
