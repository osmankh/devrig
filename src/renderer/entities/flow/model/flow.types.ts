import type { ID, Timestamp } from '@shared/types/common.types'

export interface Flow {
  id: ID
  workspaceId: ID
  name: string
  description: string | null
  status: string
  triggerConfig: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface FlowNode {
  id: ID
  workflowId: ID
  type: string
  label: string
  x: number
  y: number
  config: string | null
  createdAt: Timestamp
  updatedAt: Timestamp
}

export interface FlowEdge {
  id: ID
  workflowId: ID
  sourceNodeId: ID
  targetNodeId: ID
  sourceHandle: string | null
  targetHandle: string | null
  label: string | null
  createdAt: Timestamp
}
