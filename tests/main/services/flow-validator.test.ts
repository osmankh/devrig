import { describe, it, expect } from 'vitest'
import { validateFlow, type ValidationResult } from '../../../src/main/services/flow-validator'
import type { FlowNode, FlowEdge } from '../../../src/main/db/schema'

const now = Date.now()

function makeNode(overrides: Partial<FlowNode> & { id: string; type: string }): FlowNode {
  return {
    workflowId: 'wf-1',
    label: '',
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

function makeTrigger(id = 'trigger-1'): FlowNode {
  return makeNode({ id, type: 'trigger', label: 'Trigger' })
}

function makeAction(id: string, config?: Record<string, unknown>): FlowNode {
  return makeNode({
    id,
    type: 'action',
    label: `Action ${id}`,
    config: config ? JSON.stringify(config) : '{}',
  })
}

function makeCondition(id: string, condition?: unknown): FlowNode {
  return makeNode({
    id,
    type: 'condition',
    label: `Condition ${id}`,
    config: condition ? JSON.stringify({ condition }) : '{}',
  })
}

describe('flow-validator', () => {
  describe('empty flow', () => {
    it('rejects a flow with no nodes', () => {
      const result = validateFlow([], [])
      expect(result.valid).toBe(false)
      expect(result.errors).toHaveLength(1)
      expect(result.errors[0].message).toBe('Flow has no nodes')
    })
  })

  describe('trigger node rules', () => {
    it('requires at least one trigger node', () => {
      const nodes = [makeAction('a1')]
      const result = validateFlow(nodes, [])
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Flow must have a trigger node')).toBe(true)
    })

    it('rejects multiple trigger nodes', () => {
      const nodes = [makeTrigger('t1'), makeTrigger('t2'), makeAction('a1')]
      const edges = [makeEdge('t1', 'a1'), makeEdge('t2', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('Multiple trigger nodes'))).toBe(true)
    })

    it('requires trigger to have an outgoing edge', () => {
      const nodes = [makeTrigger(), makeAction('a1')]
      // No edge from trigger
      const edges = [makeEdge('a1', 'trigger-1')] // wrong direction, a1 is orphan concern handled separately
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Trigger node has no outgoing connections')).toBe(true)
    })
  })

  describe('non-trigger node rules', () => {
    it('requires at least one non-trigger node', () => {
      const nodes = [makeTrigger()]
      const result = validateFlow(nodes, [])
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Flow must have at least one action or condition node')).toBe(true)
    })

    it('detects orphan nodes (no incoming edge for non-trigger)', () => {
      const nodes = [makeTrigger(), makeAction('a1'), makeAction('a2')]
      const edges = [makeEdge('trigger-1', 'a1')]
      // a2 has no incoming edge
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.nodeId === 'a2' && e.message.includes('not connected'))).toBe(true)
    })
  })

  describe('cycle detection', () => {
    it('detects a simple cycle', () => {
      const nodes = [makeTrigger(), makeAction('a1'), makeAction('a2')]
      const edges = [
        makeEdge('trigger-1', 'a1'),
        makeEdge('a1', 'a2'),
        makeEdge('a2', 'a1'), // cycle
      ]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Flow contains a cycle')).toBe(true)
    })

    it('passes for a valid DAG', () => {
      const nodes = [makeTrigger(), makeAction('a1'), makeAction('a2')]
      const edges = [makeEdge('trigger-1', 'a1'), makeEdge('a1', 'a2')]

      // We need action nodes to have valid config too
      const validNodes = [
        makeTrigger(),
        makeAction('a1', { actionType: 'shell.exec', config: { command: 'echo hi' } }),
        makeAction('a2', { actionType: 'shell.exec', config: { command: 'echo done' } }),
      ]
      const result = validateFlow(validNodes, edges)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('detects a self-loop', () => {
      const nodes = [makeTrigger(), makeAction('a1')]
      const edges = [makeEdge('trigger-1', 'a1'), makeEdge('a1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Flow contains a cycle')).toBe(true)
    })
  })

  describe('action config validation', () => {
    it('requires actionType on action nodes', () => {
      const nodes = [makeTrigger(), makeAction('a1', {})]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('no action type configured'))).toBe(true)
    })

    it('validates shell.exec requires command', () => {
      const nodes = [makeTrigger(), makeAction('a1', { actionType: 'shell.exec', config: {} })]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Shell action requires a command')).toBe(true)
    })

    it('validates shell.exec rejects empty command', () => {
      const nodes = [makeTrigger(), makeAction('a1', { actionType: 'shell.exec', config: { command: '  ' } })]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Shell action requires a command')).toBe(true)
    })

    it('validates http.request requires url and method', () => {
      const nodes = [makeTrigger(), makeAction('a1', { actionType: 'http.request', config: {} })]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'HTTP action requires a URL')).toBe(true)
      expect(result.errors.some((e) => e.message === 'HTTP action requires a method')).toBe(true)
    })

    it('validates file.read requires path', () => {
      const nodes = [makeTrigger(), makeAction('a1', { actionType: 'file.read', config: {} })]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'File read action requires a path')).toBe(true)
    })

    it('rejects action with no config object', () => {
      const nodes = [makeTrigger(), makeAction('a1', { actionType: 'shell.exec' })]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('has no configuration'))).toBe(true)
    })

    it('accepts valid shell.exec config', () => {
      const nodes = [makeTrigger(), makeAction('a1', { actionType: 'shell.exec', config: { command: 'echo hi' } })]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(true)
    })

    it('accepts valid http.request config', () => {
      const nodes = [
        makeTrigger(),
        makeAction('a1', { actionType: 'http.request', config: { url: 'https://example.com', method: 'GET' } }),
      ]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(true)
    })

    it('passes unknown action types without specific validation', () => {
      const nodes = [
        makeTrigger(),
        makeAction('a1', { actionType: 'custom.whatever', config: { foo: 'bar' } }),
      ]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(true)
    })
  })

  describe('condition config validation', () => {
    it('requires condition on condition nodes', () => {
      const nodes = [makeTrigger(), makeCondition('c1')]
      const edges = [makeEdge('trigger-1', 'c1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Condition node has no condition configured')).toBe(true)
    })

    it('validates compare condition requires left, operator, right', () => {
      const cond = { type: 'compare' }
      const nodes = [makeTrigger(), makeCondition('c1', cond)]
      const edges = [makeEdge('trigger-1', 'c1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Condition is missing left value')).toBe(true)
      expect(result.errors.some((e) => e.message === 'Condition is missing operator')).toBe(true)
      expect(result.errors.some((e) => e.message === 'Condition is missing right value')).toBe(true)
    })

    it('validates compound AND condition requires sub-conditions', () => {
      const cond = { type: 'and', conditions: [] }
      const nodes = [makeTrigger(), makeCondition('c1', cond)]
      const edges = [makeEdge('trigger-1', 'c1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('Compound AND condition has no sub-conditions'))).toBe(true)
    })

    it('validates compound OR condition requires sub-conditions', () => {
      const cond = { type: 'or', conditions: [] }
      const nodes = [makeTrigger(), makeCondition('c1', cond)]
      const edges = [makeEdge('trigger-1', 'c1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('Compound OR condition has no sub-conditions'))).toBe(true)
    })

    it('recursively validates nested compound conditions', () => {
      const cond = {
        type: 'and',
        conditions: [{ type: 'compare' }], // missing left/operator/right
      }
      const nodes = [makeTrigger(), makeCondition('c1', cond)]
      const edges = [makeEdge('trigger-1', 'c1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Condition is missing left value')).toBe(true)
    })

    it('rejects condition with invalid type', () => {
      const cond = { type: 'invalid' }
      const nodes = [makeTrigger(), makeCondition('c1', cond)]
      const edges = [makeEdge('trigger-1', 'c1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message === 'Condition has invalid type')).toBe(true)
    })

    it('accepts valid compare condition', () => {
      const cond = {
        type: 'compare',
        left: { type: 'literal', value: 'a' },
        operator: 'eq',
        right: { type: 'literal', value: 'a' },
      }
      const nodes = [makeTrigger(), makeCondition('c1', cond)]
      const edges = [makeEdge('trigger-1', 'c1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(true)
    })
  })

  describe('invalid config JSON', () => {
    it('treats invalid JSON config as empty object', () => {
      const node = makeNode({ id: 'a1', type: 'action', config: 'not json' })
      const nodes = [makeTrigger(), node]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      // Should error about no actionType, not crash
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('no action type configured'))).toBe(true)
    })

    it('treats null config as empty object', () => {
      const node = makeNode({ id: 'a1', type: 'action', config: null })
      const nodes = [makeTrigger(), node]
      const edges = [makeEdge('trigger-1', 'a1')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(false)
      expect(result.errors.some((e) => e.message.includes('no action type configured'))).toBe(true)
    })
  })

  describe('complex valid flows', () => {
    it('accepts a linear trigger → action → action flow', () => {
      const nodes = [
        makeTrigger(),
        makeAction('a1', { actionType: 'shell.exec', config: { command: 'echo 1' } }),
        makeAction('a2', { actionType: 'shell.exec', config: { command: 'echo 2' } }),
      ]
      const edges = [makeEdge('trigger-1', 'a1'), makeEdge('a1', 'a2')]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(true)
      expect(result.errors).toHaveLength(0)
    })

    it('accepts a branching flow with condition', () => {
      const cond = {
        type: 'compare',
        left: { type: 'literal', value: 1 },
        operator: 'eq',
        right: { type: 'literal', value: 1 },
      }
      const nodes = [
        makeTrigger(),
        makeCondition('c1', cond),
        makeAction('a1', { actionType: 'shell.exec', config: { command: 'true' } }),
        makeAction('a2', { actionType: 'shell.exec', config: { command: 'false' } }),
      ]
      const edges = [
        makeEdge('trigger-1', 'c1'),
        makeEdge('c1', 'a1', { label: 'true' }),
        makeEdge('c1', 'a2', { label: 'false' }),
      ]
      const result = validateFlow(nodes, edges)
      expect(result.valid).toBe(true)
    })

    it('collects multiple errors at once', () => {
      // Flow with many problems: no trigger, orphan, no action config
      const nodes = [
        makeAction('a1', {}),
        makeAction('a2', { actionType: 'http.request', config: {} }),
      ]
      const result = validateFlow(nodes, [])
      expect(result.valid).toBe(false)
      // Should have: no trigger, orphan a1, orphan a2, missing actionType, missing URL, missing method
      expect(result.errors.length).toBeGreaterThanOrEqual(3)
    })
  })

  describe('node label fallback in error messages', () => {
    it('uses node label in orphan message when available', () => {
      const nodes = [makeTrigger(), makeNode({ id: 'a1', type: 'action', label: 'My Action' })]
      const edges: FlowEdge[] = [] // trigger has no outgoing, a1 is orphan
      const result = validateFlow(nodes, edges)
      expect(result.errors.some((e) => e.message.includes('My Action'))).toBe(true)
    })

    it('falls back to node type when label is empty', () => {
      const nodes = [makeTrigger(), makeNode({ id: 'a1', type: 'action', label: '' })]
      const edges: FlowEdge[] = []
      const result = validateFlow(nodes, edges)
      expect(result.errors.some((e) => e.message.includes('"action"'))).toBe(true)
    })
  })
})
