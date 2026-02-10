import { forwardRef, type ButtonHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@shared/lib/cn'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-[var(--radius-md)] text-[var(--text-sm)] font-medium transition-colors duration-[var(--duration-fast)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-border-focus)] disabled:pointer-events-none disabled:opacity-50 cursor-default',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--color-accent-primary)] text-white hover:bg-[var(--color-accent-hover)]',
        secondary:
          'bg-[var(--color-bg-tertiary)] text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)]',
        ghost:
          'hover:bg-[var(--color-bg-hover)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]',
        outline:
          'border border-[var(--color-border-default)] bg-transparent hover:bg-[var(--color-bg-hover)] text-[var(--color-text-primary)]',
        destructive:
          'bg-[var(--color-status-error)] text-white hover:bg-[var(--color-status-error)]/90'
      },
      size: {
        default: 'h-8 px-3',
        sm: 'h-7 px-2 text-[var(--text-xs)]',
        lg: 'h-9 px-4',
        icon: 'h-8 w-8'
      }
    },
    defaultVariants: {
      variant: 'default',
      size: 'default'
    }
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button, buttonVariants }
export type { ButtonProps }
