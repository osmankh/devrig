import { ipcInvoke } from '@shared/lib/ipc'
import type { Flow, FlowNode, FlowEdge } from '../model/flow.types'

export async function listFlows(
  workspaceId: string,
  limit?: number,
  offset?: number
): Promise<Flow[]> {
  return ipcInvoke<Flow[]>('db:workflow:list', workspaceId, limit, offset)
}

export async function getFlow(id: string): Promise<Flow> {
  return ipcInvoke<Flow>('db:workflow:get', id)
}

export async function getFlowWithNodes(
  id: string
): Promise<{ workflow: Flow; nodes: FlowNode[]; edges: FlowEdge[] }> {
  return ipcInvoke<{
    workflow: Flow
    nodes: FlowNode[]
    edges: FlowEdge[]
  }>('db:workflow:getWithNodes', id)
}

export async function createFlow(data: {
  workspaceId: string
  name: string
  description?: string
}): Promise<Flow> {
  return ipcInvoke<Flow>('db:workflow:create', data)
}

export async function updateFlow(
  id: string,
  data: {
    name?: string
    description?: string
    status?: string
  }
): Promise<Flow> {
  return ipcInvoke<Flow>('db:workflow:update', id, data)
}

export async function deleteFlow(id: string): Promise<boolean> {
  return ipcInvoke<boolean>('db:workflow:delete', id)
}

export async function batchCreateNodes(
  nodes: Array<{
    workflowId: string
    type: string
    label?: string
    x?: number
    y?: number
    config?: string
  }>
): Promise<FlowNode[]> {
  return ipcInvoke<FlowNode[]>('db:node:batchCreate', nodes)
}

export async function batchUpdateNodes(
  updates: Array<{
    id: string
    type?: string
    label?: string
    x?: number
    y?: number
    config?: string
  }>
): Promise<FlowNode[]> {
  return ipcInvoke<FlowNode[]>('db:node:batchUpdate', updates)
}

export async function batchCreateEdges(
  edges: Array<{
    workflowId: string
    sourceNodeId: string
    targetNodeId: string
    sourceHandle?: string
    targetHandle?: string
    label?: string
  }>
): Promise<FlowEdge[]> {
  return ipcInvoke<FlowEdge[]>('db:edge:batchCreate', edges)
}
