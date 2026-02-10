import { useFlowStore } from '@entities/flow'
import { useRouterStore } from '@app/router/router'
import { ScrollArea } from '@shared/ui'

export function SidebarFlowList() {
  const flows = useFlowStore((s) => s.flows)
  const currentWorkflowId = useFlowStore((s) => s.currentWorkflowId)
  const navigate = useRouterStore((s) => s.navigate)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="px-5 py-2">
        <span className="text-[var(--text-xs)] font-medium uppercase tracking-wider text-[var(--color-text-tertiary)]">
          Flows
        </span>
      </div>
      <ScrollArea className="flex-1">
        <div className="px-3 pb-2">
          {flows.length === 0 ? (
            <p className="px-2 py-4 text-center text-[var(--text-xs)] text-[var(--color-text-tertiary)]">
              No flows yet
            </p>
          ) : (
            flows.map((flow) => (
              <button
                key={flow.id}
                onClick={() =>
                  navigate({ view: 'flow-editor', flowId: flow.id })
                }
                className={`flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-left text-[var(--text-sm)] transition-colors duration-[var(--duration-fast)] ${
                  currentWorkflowId === flow.id
                    ? 'bg-[var(--color-accent-muted)] text-[var(--color-text-primary)]'
                    : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]'
                }`}
              >
                <svg
                  className="h-3.5 w-3.5 shrink-0"
                  viewBox="0 0 16 16"
                  fill="none"
                >
                  <path
                    d="M2 4h4l2 2h6v6H2V4z"
                    stroke="currentColor"
                    strokeWidth="1.2"
                    strokeLinejoin="round"
                  />
                </svg>
                <span className="truncate">{flow.name}</span>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
