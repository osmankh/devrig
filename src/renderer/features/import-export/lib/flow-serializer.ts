import type { Flow, FlowNode, FlowEdge } from '@entities/flow/model/flow.types'

export interface FlowExportData {
  version: 1
  flow: {
    name: string
    description: string | null
    status: string
    triggerConfig: string | null
  }
  nodes: Array<{
    type: string
    label: string
    x: number
    y: number
    config: string | null
  }>
  edges: Array<{
    sourceIndex: number // index into nodes array (since IDs change on import)
    targetIndex: number
    sourceHandle: string | null
    targetHandle: string | null
    label: string | null
  }>
}

export function exportFlow(
  flow: Flow,
  nodes: Record<string, FlowNode>,
  edges: Record<string, FlowEdge>,
): string {
  const nodeArray = Object.values(nodes)
  const nodeIndexMap = new Map(nodeArray.map((n, i) => [n.id, i]))

  const data: FlowExportData = {
    version: 1,
    flow: {
      name: flow.name,
      description: flow.description,
      status: flow.status,
      triggerConfig: flow.triggerConfig,
    },
    nodes: nodeArray.map((n) => ({
      type: n.type,
      label: n.label,
      x: n.x,
      y: n.y,
      config: n.config,
    })),
    edges: Object.values(edges).map((e) => ({
      sourceIndex: nodeIndexMap.get(e.sourceNodeId) ?? 0,
      targetIndex: nodeIndexMap.get(e.targetNodeId) ?? 0,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      label: e.label,
    })),
  }

  return JSON.stringify(data, null, 2)
}

export function validateImport(json: string): FlowExportData | null {
  try {
    const data = JSON.parse(json) as FlowExportData
    if (data.version !== 1) return null
    if (!data.flow || !data.nodes || !data.edges) return null
    if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return null
    return data
  } catch {
    return null
  }
}
