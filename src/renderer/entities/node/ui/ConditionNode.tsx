import { memo, useMemo } from 'react'
import { type NodeProps } from '@xyflow/react'
import { GitBranch } from 'lucide-react'
import { BaseNode, type BaseNodeData } from './BaseNode'

export const ConditionNode = memo(function ConditionNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData

  const summary = useMemo(() => {
    if (!nodeData.config) return null
    try {
      const config = JSON.parse(nodeData.config) as Record<string, unknown>
      const condition = config.condition as Record<string, unknown> | undefined
      if (!condition) return null
      const left = condition.left as Record<string, unknown> | undefined
      const operator = condition.operator as string
      const right = condition.right as Record<string, unknown> | undefined
      const leftStr = left?.type === 'literal' ? String(left.value) : left?.type === 'node' ? `{{${left.nodeId}.${left.path}}}` : String(left?.path ?? '')
      const rightStr = right?.type === 'literal' ? String(right.value) : right?.type === 'node' ? `{{${right.nodeId}.${right.path}}}` : String(right?.path ?? '')
      return `${leftStr} ${operator} ${rightStr}`
    } catch {
      return null
    }
  }, [nodeData.config])

  return (
    <BaseNode
      id={id}
      selected={!!selected}
      label={nodeData.label ?? 'Condition'}
      icon={<GitBranch className="h-4 w-4 text-[var(--color-node-condition)]" />}
      accentColor="border-l-[var(--color-node-condition)]"
      showTargetHandle={true}
      showSourceHandle={false}
      sourceHandles={[
        { id: 'true', label: 'true', position: 35 },
        { id: 'false', label: 'false', position: 65 },
      ]}
    >
      {summary && <span className="block truncate font-[var(--font-mono)]">{summary}</span>}
      <div className="mt-1 flex justify-end gap-2 text-[10px]">
        <span className="text-[var(--color-status-success)]">true →</span>
        <span className="text-[var(--color-status-error)]">false →</span>
      </div>
    </BaseNode>
  )
})
