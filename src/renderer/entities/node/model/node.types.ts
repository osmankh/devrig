export type NodeType = 'trigger' | 'action' | 'condition'

export type TriggerType = 'manual'

export type ActionType = 'shell.exec' | 'http.request' | 'file.read'

export interface ShellExecConfig {
  command: string
  workingDirectory?: string
  timeout?: number
}

export interface HttpRequestConfig {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  url: string
  headers?: Record<string, string>
  body?: string
  timeout?: number
}

export interface FileReadConfig {
  path: string
  encoding?: string
}

export type ActionConfig = ShellExecConfig | HttpRequestConfig | FileReadConfig

export interface CompareCondition {
  type: 'compare'
  left: ValueRef
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  right: ValueRef
}

export type ConditionExpression = CompareCondition

export type ValueRef =
  | { type: 'literal'; value: string | number | boolean }
  | { type: 'context'; path: string }
  | { type: 'node'; nodeId: string; path: string }

export interface TriggerNodeConfig {
  triggerType: TriggerType
}

export interface ActionNodeConfig {
  actionType: ActionType
  config: ActionConfig
}

export interface ConditionNodeConfig {
  condition: ConditionExpression
}

export type NodeConfig = TriggerNodeConfig | ActionNodeConfig | ConditionNodeConfig
