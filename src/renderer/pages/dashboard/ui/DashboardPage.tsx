import { FlowList } from './FlowList'
import { CreateFlowButton } from './CreateFlowButton'

export function DashboardPage() {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-3">
        <h1 className="text-[var(--text-lg)] font-semibold text-[var(--color-text-primary)]">
          Dashboard
        </h1>
        <CreateFlowButton />
      </div>
      <div className="flex-1 overflow-hidden px-6 py-4">
        <FlowList />
      </div>
    </div>
  )
}
