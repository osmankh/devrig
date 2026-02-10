import type { HTMLAttributes } from 'react'
import { cn } from '@shared/lib/cn'

function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)]',
        className
      )}
      {...props}
    />
  )
}

export { Skeleton }
