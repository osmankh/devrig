import type { ComponentPropsWithoutRef } from 'react'
import { cn } from '@shared/lib/cn'
import {
  Group,
  Panel,
  Separator
} from 'react-resizable-panels'

function ResizablePanelGroup({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Group>) {
  return (
    <Group
      className={cn('flex h-full w-full', className)}
      {...props}
    />
  )
}

function ResizablePanel({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Panel>) {
  return <Panel className={cn(className)} {...props} />
}

function ResizableHandle({
  className,
  ...props
}: ComponentPropsWithoutRef<typeof Separator> & { className?: string }) {
  return (
    <Separator
      className={cn(
        'relative flex w-px items-center justify-center bg-[var(--color-border-subtle)] after:absolute after:inset-y-0 after:-left-1 after:-right-1 after:content-[""] hover:bg-[var(--color-border-default)] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-border-focus)]',
        className
      )}
      {...props}
    />
  )
}

export { ResizablePanelGroup, ResizablePanel, ResizableHandle }
