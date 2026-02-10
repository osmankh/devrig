import { useWorkspaceStore } from '@entities/workspace'
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem
} from '@shared/ui'

export function SidebarWorkspaceNav() {
  const workspaces = useWorkspaceStore((s) => s.workspaces)
  const activeId = useWorkspaceStore((s) => s.activeWorkspaceId)
  const setActive = useWorkspaceStore((s) => s.setActiveWorkspace)

  const active = workspaces.find((w) => w.id === activeId)

  return (
    <div className="px-3 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger className="flex w-full items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-sm)] font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-bg-hover)] outline-none">
          <span className="truncate">{active?.name ?? 'Workspace'}</span>
          <svg
            className="ml-auto h-3 w-3 shrink-0 text-[var(--color-text-tertiary)]"
            viewBox="0 0 12 12"
            fill="none"
          >
            <path
              d="M3 4.5L6 7.5L9 4.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-52">
          {workspaces.map((ws) => (
            <DropdownMenuItem
              key={ws.id}
              onClick={() => setActive(ws.id)}
              className={
                ws.id === activeId
                  ? 'bg-[var(--color-accent-muted)]'
                  : ''
              }
            >
              {ws.name}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
