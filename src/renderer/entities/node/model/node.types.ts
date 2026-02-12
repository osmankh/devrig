export type NodeType = 'trigger' | 'action' | 'condition'

export type TriggerType = 'manual' | 'schedule'

export interface ScheduleConfig {
  intervalValue: number
  intervalUnit: 'minutes' | 'hours' | 'days'
}

export type ActionType = 'shell.exec' | 'http.request' | 'file.read' | 'plugin.action'

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

export interface PluginActionConfig {
  pluginId: string
  actionId: string
  params?: Record<string, unknown>
}

export type ActionConfig = ShellExecConfig | HttpRequestConfig | FileReadConfig | PluginActionConfig

export interface CompareCondition {
  type: 'compare'
  left: ValueRef
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte'
  right: ValueRef
}

export interface AndCondition {
  type: 'and'
  conditions: ConditionExpression[]
}

export interface OrCondition {
  type: 'or'
  conditions: ConditionExpression[]
}

export type ConditionExpression = CompareCondition | AndCondition | OrCondition

export type ValueRef =
  | { type: 'literal'; value: string | number | boolean }
  | { type: 'context'; path: string }
  | { type: 'node'; nodeId: string; path: string }

export interface TriggerNodeConfig {
  triggerType: TriggerType
  schedule?: ScheduleConfig
}

export interface ActionNodeConfig {
  actionType: ActionType
  config: ActionConfig
}

export interface ConditionNodeConfig {
  condition: ConditionExpression
}

export type NodeConfig = TriggerNodeConfig | ActionNodeConfig | ConditionNodeConfig
