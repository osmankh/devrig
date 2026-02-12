import { z } from 'zod'
import type { FlowNode, FlowEdge } from '../db/schema'

export interface ValidationError {
  nodeId?: string
  message: string
}

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
}

/** Validate a flow before execution */
export function validateFlow(nodes: FlowNode[], edges: FlowEdge[]): ValidationResult {
  const errors: ValidationError[] = []

  // 1. Must have at least one node
  if (nodes.length === 0) {
    errors.push({ message: 'Flow has no nodes' })
    return { valid: false, errors }
  }

  // 2. Must have exactly one trigger node
  const triggerNodes = nodes.filter((n) => n.type === 'trigger')
  if (triggerNodes.length === 0) {
    errors.push({ message: 'Flow must have a trigger node' })
  } else if (triggerNodes.length > 1) {
    for (const t of triggerNodes.slice(1)) {
      errors.push({ nodeId: t.id, message: `Multiple trigger nodes found — only one is allowed` })
    }
  }

  // 3. Must have at least one non-trigger node
  const nonTriggerNodes = nodes.filter((n) => n.type !== 'trigger')
  if (nonTriggerNodes.length === 0) {
    errors.push({ message: 'Flow must have at least one action or condition node' })
  }

  // 4. No orphan nodes (every non-trigger node must have at least one incoming edge)
  const nodesWithIncoming = new Set(edges.map((e) => e.targetNodeId))
  for (const node of nonTriggerNodes) {
    if (!nodesWithIncoming.has(node.id)) {
      errors.push({
        nodeId: node.id,
        message: `Node "${node.label || node.type}" is not connected to the flow`,
      })
    }
  }

  // 5. Trigger node should have at least one outgoing edge
  for (const trigger of triggerNodes) {
    const hasOutgoing = edges.some((e) => e.sourceNodeId === trigger.id)
    if (!hasOutgoing) {
      errors.push({
        nodeId: trigger.id,
        message: 'Trigger node has no outgoing connections',
      })
    }
  }

  // 6. Cycle detection via topological sort (Kahn's algorithm)
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()
  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }
  for (const edge of edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId)
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1)
  }
  const queue: string[] = []
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId)
  }
  let sortedCount = 0
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    sortedCount++
    for (const neighborId of adjacency.get(nodeId) ?? []) {
      const newDegree = (inDegree.get(neighborId) ?? 1) - 1
      inDegree.set(neighborId, newDegree)
      if (newDegree === 0) queue.push(neighborId)
    }
  }
  if (sortedCount !== nodes.length) {
    errors.push({ message: 'Flow contains a cycle' })
  }

  // 7. Validate node configs
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))

  for (const node of nodes) {
    const config = parseConfig(node.config)

    if (node.type === 'action') {
      if (!config.actionType) {
        errors.push({
          nodeId: node.id,
          message: `Action node "${node.label || 'Untitled'}" has no action type configured`,
        })
      } else {
        const actionConfig = config.config as Record<string, unknown> | undefined
        const actionErrors = validateActionConfig(config.actionType as string, actionConfig)
        for (const msg of actionErrors) {
          errors.push({ nodeId: node.id, message: msg })
        }
      }
    }

    if (node.type === 'condition') {
      const condErrors = validateConditionConfig(config.condition)
      for (const msg of condErrors) {
        errors.push({ nodeId: node.id, message: msg })
      }
    }
  }

  return { valid: errors.length === 0, errors }
}

function parseConfig(config: string | null): Record<string, unknown> {
  if (!config) return {}
  try {
    return JSON.parse(config) as Record<string, unknown>
  } catch {
    return {}
  }
}

function validateActionConfig(actionType: string, config: Record<string, unknown> | undefined): string[] {
  const errors: string[] = []
  if (!config) {
    errors.push(`Action "${actionType}" has no configuration`)
    return errors
  }

  switch (actionType) {
    case 'shell.exec':
      if (!config.command || (typeof config.command === 'string' && config.command.trim() === '')) {
        errors.push('Shell action requires a command')
      }
      break
    case 'http.request':
      if (!config.url || (typeof config.url === 'string' && config.url.trim() === '')) {
        errors.push('HTTP action requires a URL')
      }
      if (!config.method) {
        errors.push('HTTP action requires a method')
      }
      break
    case 'file.read':
      if (!config.path || (typeof config.path === 'string' && config.path.trim() === '')) {
        errors.push('File read action requires a path')
      }
      break
  }

  return errors
}

function validateConditionConfig(condition: unknown): string[] {
  const errors: string[] = []
  if (!condition) {
    errors.push('Condition node has no condition configured')
    return errors
  }

  const condObj = condition as Record<string, unknown>
  if (condObj.type === 'compare') {
    if (!condObj.left) errors.push('Condition is missing left value')
    if (!condObj.operator) errors.push('Condition is missing operator')
    if (!condObj.right) errors.push('Condition is missing right value')
  } else if (condObj.type === 'and' || condObj.type === 'or') {
    const conditions = condObj.conditions as unknown[] | undefined
    if (!conditions || conditions.length === 0) {
      errors.push(`Compound ${condObj.type.toUpperCase()} condition has no sub-conditions`)
    } else {
      for (const sub of conditions) {
        errors.push(...validateConditionConfig(sub))
      }
    }
  } else {
    errors.push('Condition has invalid type')
  }

  return errors
}
