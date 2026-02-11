import { memo } from 'react'
import { type NodeProps } from '@xyflow/react'
import { Zap } from 'lucide-react'
import { BaseNode, type BaseNodeData } from './BaseNode'

export const TriggerNode = memo(function TriggerNode({ id, data, selected }: NodeProps) {
  const nodeData = data as BaseNodeData
  return (
    <BaseNode
      id={id}
      selected={!!selected}
      label={nodeData.label ?? 'Manual Trigger'}
      icon={<Zap className="h-4 w-4 text-[var(--color-node-trigger)]" />}
      accentColor="border-l-[var(--color-node-trigger)]"
      showTargetHandle={false}
      showSourceHandle={true}
    >
      <span className="text-[var(--color-node-trigger)]/70">Manual</span>
    </BaseNode>
  )
})
