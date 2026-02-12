import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import { useFlowStore } from '@entities/flow'
import { FlowCard } from './FlowCard'

export function FlowList() {
  const flows = useFlowStore((s) => s.flows)
  const parentRef = useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: flows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 72,
    overscan: 8
  })

  if (flows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16">
        <p className="text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
          No flows yet. Create your first flow to get started.
        </p>
      </div>
    )
  }

  return (
    <div ref={parentRef} className="h-full overflow-auto">
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative'
        }}
      >
        {virtualizer.getVirtualItems().map((virtualItem) => {
          const flow = flows[virtualItem.index]
          return (
            <div
              key={virtualItem.key}
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: `${virtualItem.size}px`,
                transform: `translateY(${virtualItem.start}px)`
              }}
              className="px-1 py-1"
            >
              <FlowCard flow={flow} />
            </div>
          )
        })}
      </div>
    </div>
  )
}
