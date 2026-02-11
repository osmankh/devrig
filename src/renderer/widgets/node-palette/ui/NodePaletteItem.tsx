import { type DragEvent, memo } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@shared/lib/cn'

interface NodePaletteItemProps {
  type: string
  label: string
  description: string
  icon: ReactNode
  defaultConfig: string
}

export const NodePaletteItem = memo(function NodePaletteItem({
  type,
  label,
  description,
  icon,
  defaultConfig,
}: NodePaletteItemProps) {
  const onDragStart = (event: DragEvent) => {
    event.dataTransfer.setData('application/devrig-node-type', type)
    event.dataTransfer.setData('application/devrig-node-label', label)
    event.dataTransfer.setData('application/devrig-node-config', defaultConfig)
    event.dataTransfer.effectAllowed = 'move'
  }

  return (
    <div
      className={cn(
        'flex cursor-grab items-center gap-2.5 rounded-[var(--radius-md)] border border-[var(--color-border-default)] bg-[var(--color-bg-secondary)] px-3 py-2',
        'transition-colors hover:bg-[var(--color-bg-hover)] active:cursor-grabbing',
      )}
      draggable
      onDragStart={onDragStart}
    >
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)]">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="truncate text-[var(--text-xs)] font-medium text-[var(--color-text-primary)]">{label}</div>
        <div className="truncate text-[11px] text-[var(--color-text-tertiary)]">{description}</div>
      </div>
    </div>
  )
})
