import type { HTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@shared/lib/cn'

const badgeVariants = cva(
  'inline-flex items-center rounded-[var(--radius-full)] px-2 py-0.5 text-[var(--text-xs)] font-medium transition-colors',
  {
    variants: {
      variant: {
        default: 'bg-[var(--color-accent-muted)] text-[var(--color-accent-primary)]',
        success: 'bg-[oklch(0.648_0.15_160/0.15)] text-[var(--color-status-success)]',
        warning: 'bg-[oklch(0.75_0.15_80/0.15)] text-[var(--color-status-warning)]',
        error: 'bg-[oklch(0.637_0.237_25/0.15)] text-[var(--color-status-error)]',
        secondary: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
      }
    },
    defaultVariants: {
      variant: 'default'
    }
  }
)

interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge, badgeVariants }
export type { BadgeProps }
