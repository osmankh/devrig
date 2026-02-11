import { memo, useState } from 'react'
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from '@xyflow/react'
import { X } from 'lucide-react'
import { useFlowStore } from '@entities/flow/model/flow-store'

export const AnimatedEdge = memo(function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  selected,
  animated,
  style,
}: EdgeProps) {
  const [hovered, setHovered] = useState(false)
  const removeEdges = useFlowStore((s) => s.removeEdges)

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  })

  return (
    <>
      {/* Invisible wider path for easier hover targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
      />
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          ...style,
          strokeWidth: selected ? 2 : 1.5,
          stroke: selected ? 'var(--color-accent-primary)' : 'var(--color-border-default)',
          strokeDasharray: animated ? '5 5' : undefined,
          animation: animated ? 'dashdraw 0.5s linear infinite' : undefined,
        }}
      />
      <EdgeLabelRenderer>
        {label && (
          <div
            className="pointer-events-none absolute rounded bg-[var(--color-bg-elevated)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-text-secondary)] border border-[var(--color-border-default)]"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
          >
            {label}
          </div>
        )}
        {hovered && (
          <button
            className="absolute flex h-4 w-4 items-center justify-center rounded-full bg-[var(--color-status-error)] text-[var(--color-bg-primary)] hover:bg-[var(--color-status-error)]/90 cursor-pointer"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: 'all',
            }}
            onClick={() => removeEdges([id])}
          >
            <X className="h-2.5 w-2.5" />
          </button>
        )}
      </EdgeLabelRenderer>
    </>
  )
})
