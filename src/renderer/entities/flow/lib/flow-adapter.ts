import type { Node, Edge, NodeChange, EdgeChange, Connection } from '@xyflow/react'
import type { FlowNode, FlowEdge } from '../model/flow.types'

/** Convert store FlowNodes (Record) to React Flow Node[] */
export function toReactFlowNodes(nodes: Record<string, FlowNode>): Node[] {
  return Object.values(nodes).map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.x, y: node.y },
    data: {
      label: node.label,
      config: node.config,
      workflowId: node.workflowId,
    },
    selected: false,
  }))
}

/** Convert store FlowEdges (Record) to React Flow Edge[] */
export function toReactFlowEdges(edges: Record<string, FlowEdge>): Edge[] {
  return Object.values(edges).map((edge) => ({
    id: edge.id,
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    sourceHandle: edge.sourceHandle ?? undefined,
    targetHandle: edge.targetHandle ?? undefined,
    label: edge.label ?? undefined,
    type: 'smoothstep',
    animated: false,
  }))
}

/** Apply React Flow NodeChange events back to the store */
export function applyNodeChanges(
  changes: NodeChange[],
  updateNode: (id: string, data: Partial<FlowNode>) => void,
  removeNodes: (ids: string[]) => void,
  setSelectedNodes: (ids: string[]) => void,
  currentSelectedIds: string[],
): void {
  const removedIds: string[] = []
  const newSelectedIds = new Set(currentSelectedIds)

  for (const change of changes) {
    switch (change.type) {
      case 'position':
        if (change.position) {
          updateNode(change.id, { x: change.position.x, y: change.position.y })
        }
        break
      case 'remove':
        removedIds.push(change.id)
        newSelectedIds.delete(change.id)
        break
      case 'select':
        if (change.selected) {
          newSelectedIds.add(change.id)
        } else {
          newSelectedIds.delete(change.id)
        }
        break
    }
  }

  if (removedIds.length > 0) {
    removeNodes(removedIds)
  }

  // Only update selection if it changed
  const selectedArray = Array.from(newSelectedIds)
  if (
    selectedArray.length !== currentSelectedIds.length ||
    selectedArray.some((id) => !currentSelectedIds.includes(id))
  ) {
    setSelectedNodes(selectedArray)
  }
}

/** Apply React Flow EdgeChange events back to the store */
export function applyEdgeChanges(
  changes: EdgeChange[],
  removeEdges: (ids: string[]) => void,
): void {
  const removedIds: string[] = []

  for (const change of changes) {
    if (change.type === 'remove') {
      removedIds.push(change.id)
    }
  }

  if (removedIds.length > 0) {
    removeEdges(removedIds)
  }
}

/** Convert a React Flow Connection to the data needed for edge creation */
export function connectionToEdgeData(connection: Connection, workflowId: string) {
  return {
    workflowId,
    sourceNodeId: connection.source,
    targetNodeId: connection.target,
    sourceHandle: connection.sourceHandle ?? undefined,
    targetHandle: connection.targetHandle ?? undefined,
  }
}
