import type { BrowserWindow } from 'electron'
import type { FlowNode, FlowEdge } from '../db/schema'
import type { WorkflowRepository } from '../db/repositories/workflow.repository'
import type { ExecutionRepository } from '../db/repositories/execution.repository'
import { evaluateCondition, type ExecutionContext } from './condition-engine'
import { executeAction } from './actions'

interface Repositories {
  workflow: WorkflowRepository
  execution: ExecutionRepository
}

// Track running executions for cancellation
const runningExecutions = new Map<string, { aborted: boolean }>()

/** Interpolate {{nodes.nodeId.output.path}} templates in strings */
function interpolateTemplate(value: string, context: ExecutionContext): string {
  return value.replace(/\{\{(.+?)\}\}/g, (_match, path: string) => {
    const trimmed = path.trim()
    // Resolve from context using dot-path
    const parts = trimmed.split('.')
    let current: unknown = context
    for (const part of parts) {
      if (current == null || typeof current !== 'object') return ''
      current = (current as Record<string, unknown>)[part]
    }
    if (current == null) return ''
    return typeof current === 'object' ? JSON.stringify(current) : String(current)
  })
}

/** Deep interpolate all string values in an object */
function interpolateConfig(config: Record<string, unknown>, context: ExecutionContext): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'string') {
      result[key] = interpolateTemplate(value, context)
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = interpolateConfig(value as Record<string, unknown>, context)
    } else {
      result[key] = value
    }
  }
  return result
}

/** Topological sort using Kahn's algorithm */
function topologicalSort(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]))
  const inDegree = new Map<string, number>()
  const adjacency = new Map<string, string[]>()

  // Initialize
  for (const node of nodes) {
    inDegree.set(node.id, 0)
    adjacency.set(node.id, [])
  }

  // Build graph
  for (const edge of edges) {
    adjacency.get(edge.sourceNodeId)?.push(edge.targetNodeId)
    inDegree.set(edge.targetNodeId, (inDegree.get(edge.targetNodeId) ?? 0) + 1)
  }

  // BFS from nodes with in-degree 0
  const queue: string[] = []
  for (const [nodeId, degree] of inDegree) {
    if (degree === 0) queue.push(nodeId)
  }

  const sorted: FlowNode[] = []
  while (queue.length > 0) {
    const nodeId = queue.shift()!
    const node = nodeMap.get(nodeId)
    if (node) sorted.push(node)

    for (const neighborId of adjacency.get(nodeId) ?? []) {
      const newDegree = (inDegree.get(neighborId) ?? 1) - 1
      inDegree.set(neighborId, newDegree)
      if (newDegree === 0) queue.push(neighborId)
    }
  }

  // Cycle detection: if not all nodes are in sorted, there's a cycle
  if (sorted.length !== nodes.length) {
    throw new Error('Workflow contains a cycle and cannot be executed')
  }

  return sorted
}

/** Mark a node and all its descendants as skipped (for condition branch not taken) */
function markDescendantsSkipped(
  nodeId: string,
  edgesBySource: Map<string, FlowEdge[]>,
  skippedNodes: Set<string>,
): void {
  if (skippedNodes.has(nodeId)) return
  skippedNodes.add(nodeId)
  for (const edge of edgesBySource.get(nodeId) ?? []) {
    markDescendantsSkipped(edge.targetNodeId, edgesBySource, skippedNodes)
  }
}

export async function executeWorkflow(
  workflowId: string,
  triggerType: string,
  repos: Repositories,
  mainWindow: BrowserWindow | null,
): Promise<{ executionId: string }> {
  // Load workflow data
  const data = repos.workflow.getWithNodes(workflowId)
  if (!data) throw new Error(`Workflow not found: ${workflowId}`)

  const { nodes, edges } = data

  // Topological sort (throws on cycle)
  const sortedNodes = topologicalSort(nodes, edges)

  // Create execution record
  const execution = repos.execution.create({
    workflowId,
    triggerType,
    status: 'running',
  })
  const executionId = execution.id
  const now = Date.now()
  repos.execution.update(executionId, { startedAt: now })

  // Track for cancellation
  const handle = { aborted: false }
  runningExecutions.set(executionId, handle)

  // Build edge lookup: sourceNodeId -> edges
  const edgesBySource = new Map<string, FlowEdge[]>()
  for (const edge of edges) {
    const existing = edgesBySource.get(edge.sourceNodeId) ?? []
    existing.push(edge)
    edgesBySource.set(edge.sourceNodeId, existing)
  }

  // Execution context for template interpolation and conditions
  const context: ExecutionContext = {
    nodes: {},
    trigger: { type: triggerType },
  }

  // Track which nodes to skip (condition branches)
  const skippedNodes = new Set<string>()

  // Create all steps upfront as pending
  const stepMap = new Map<string, string>()
  for (const node of sortedNodes) {
    const step = repos.execution.createStep({
      executionId,
      nodeId: node.id,
      status: 'pending',
    })
    stepMap.set(node.id, step.id)
  }

  try {
    for (const node of sortedNodes) {
      if (handle.aborted) {
        repos.execution.update(executionId, {
          status: 'cancelled',
          completedAt: Date.now(),
          error: 'Execution cancelled by user',
        })
        mainWindow?.webContents.send('execution:complete', {
          id: executionId,
          status: 'cancelled',
        })
        return { executionId }
      }

      const stepId = stepMap.get(node.id)!

      // Skip nodes that are on non-taken condition branches
      if (skippedNodes.has(node.id)) {
        repos.execution.updateStep(stepId, { status: 'skipped', completedAt: Date.now() })
        mainWindow?.webContents.send('execution:step-update', {
          executionId,
          nodeId: node.id,
          stepId,
          status: 'skipped',
        })
        continue
      }

      // Mark step as running
      const stepStart = Date.now()
      repos.execution.updateStep(stepId, { status: 'running', startedAt: stepStart })
      mainWindow?.webContents.send('execution:step-update', {
        executionId,
        nodeId: node.id,
        stepId,
        status: 'running',
      })

      try {
        let output: unknown = null

        if (node.type === 'trigger') {
          // Manual trigger: no-op, just pass through
          output = { triggered: true, type: triggerType }
        } else if (node.type === 'action') {
          // Parse config, interpolate templates, execute action
          const rawConfig = node.config ? JSON.parse(node.config) as Record<string, unknown> : {}
          const actionType = rawConfig.actionType as string
          const actionConfig = rawConfig.config as Record<string, unknown> ?? {}
          const interpolated = interpolateConfig(actionConfig, context)

          const result = await executeAction(actionType, interpolated)
          output = result.output

          if (!result.success) {
            throw new Error(
              typeof result.output === 'object' && result.output !== null
                ? JSON.stringify(result.output)
                : String(result.output),
            )
          }
        } else if (node.type === 'condition') {
          // Evaluate condition
          const rawConfig = node.config ? JSON.parse(node.config) as Record<string, unknown> : {}
          const condition = rawConfig.condition
          const result = evaluateCondition(condition, context)
          output = { result }

          // Determine which branch to skip
          const outEdges = edgesBySource.get(node.id) ?? []
          for (const edge of outEdges) {
            const edgeLabel = edge.label ?? edge.sourceHandle
            if (edgeLabel === 'true' && !result) {
              markDescendantsSkipped(edge.targetNodeId, edgesBySource, skippedNodes)
            } else if (edgeLabel === 'false' && result) {
              markDescendantsSkipped(edge.targetNodeId, edgesBySource, skippedNodes)
            }
          }
        }

        // Record success
        const stepEnd = Date.now()
        context.nodes[node.id] = { output }
        repos.execution.updateStep(stepId, {
          status: 'success',
          input: node.config ?? undefined,
          output: JSON.stringify(output),
          completedAt: stepEnd,
          durationMs: stepEnd - stepStart,
        })
        mainWindow?.webContents.send('execution:step-update', {
          executionId,
          nodeId: node.id,
          stepId,
          status: 'success',
          output,
          durationMs: stepEnd - stepStart,
        })
      } catch (error) {
        const stepEnd = Date.now()
        const errorMessage = error instanceof Error ? error.message : String(error)

        repos.execution.updateStep(stepId, {
          status: 'error',
          error: errorMessage,
          completedAt: stepEnd,
          durationMs: stepEnd - stepStart,
        })
        mainWindow?.webContents.send('execution:step-update', {
          executionId,
          nodeId: node.id,
          stepId,
          status: 'error',
          error: errorMessage,
          durationMs: stepEnd - stepStart,
        })

        // Stop execution on first error
        repos.execution.update(executionId, {
          status: 'failed',
          completedAt: stepEnd,
          error: `Node "${node.label}" failed: ${errorMessage}`,
        })
        mainWindow?.webContents.send('execution:complete', {
          id: executionId,
          status: 'failed',
          error: errorMessage,
        })
        return { executionId }
      }
    }

    // All nodes succeeded
    const endTime = Date.now()
    repos.execution.update(executionId, {
      status: 'success',
      completedAt: endTime,
    })
    mainWindow?.webContents.send('execution:complete', {
      id: executionId,
      status: 'success',
    })

    return { executionId }
  } finally {
    runningExecutions.delete(executionId)
  }
}

export function cancelExecution(executionId: string): boolean {
  const handle = runningExecutions.get(executionId)
  if (handle) {
    handle.aborted = true
    return true
  }
  return false
}
