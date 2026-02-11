import { TriggerNode } from '../ui/TriggerNode'
import { ActionNode } from '../ui/ActionNode'
import { ConditionNode } from '../ui/ConditionNode'
import type { NodeType } from './node.types'

export const nodeTypes = {
  trigger: TriggerNode,
  action: ActionNode,
  condition: ConditionNode,
} as const

export interface NodeDefinition {
  type: NodeType
  label: string
  description: string
  defaultConfig: string
  defaultWidth: number
  defaultHeight: number
}

export const nodeDefinitions: NodeDefinition[] = [
  {
    type: 'trigger',
    label: 'Manual Trigger',
    description: 'Start workflow manually',
    defaultConfig: JSON.stringify({ triggerType: 'manual' }),
    defaultWidth: 200,
    defaultHeight: 80,
  },
  {
    type: 'action',
    label: 'Shell Command',
    description: 'Execute a shell command',
    defaultConfig: JSON.stringify({ actionType: 'shell.exec', config: { command: '' } }),
    defaultWidth: 200,
    defaultHeight: 80,
  },
  {
    type: 'action',
    label: 'HTTP Request',
    description: 'Make an HTTP request',
    defaultConfig: JSON.stringify({ actionType: 'http.request', config: { method: 'GET', url: '' } }),
    defaultWidth: 200,
    defaultHeight: 80,
  },
  {
    type: 'action',
    label: 'Read File',
    description: 'Read a file from disk',
    defaultConfig: JSON.stringify({ actionType: 'file.read', config: { path: '' } }),
    defaultWidth: 200,
    defaultHeight: 80,
  },
  {
    type: 'condition',
    label: 'Condition',
    description: 'Branch based on a condition',
    defaultConfig: JSON.stringify({ condition: { type: 'compare', left: { type: 'literal', value: '' }, operator: 'eq', right: { type: 'literal', value: '' } } }),
    defaultWidth: 200,
    defaultHeight: 100,
  },
]
