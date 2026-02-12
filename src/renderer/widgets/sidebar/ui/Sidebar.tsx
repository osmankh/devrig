import { motion } from 'motion/react'
import { useUIStore } from '@app/stores/ui-store'
import { useRouterStore } from '@app/router/router'
import { Separator } from '@shared/ui'
import { SidebarWorkspaceNav } from './SidebarWorkspaceNav'
import { SidebarFlowList } from './SidebarFlowList'

export function Sidebar() {
  const collapsed = useUIStore((s) => s.sidebarCollapsed)
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const navigate = useRouterStore((s) => s.navigate)

  return (
    <motion.aside
      className="flex h-full flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]"
      animate={{ width: collapsed ? 48 : 240 }}
      transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
    >
      {collapsed ? (
        <div className="flex flex-col items-center gap-2 pt-2">
          <button
            onClick={toggleSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            title="Expand sidebar"
          >
            <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
              <path
                d="M6 3l5 5-5 5"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
        </div>
      ) : (
        <>
          <SidebarWorkspaceNav />
          <Separator />
          <nav className="flex flex-col gap-0.5 px-3 py-2">
            <button
              onClick={() => navigate({ view: 'inbox' })}
              className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <rect
                  x="2"
                  y="3"
                  width="12"
                  height="10"
                  rx="1.5"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M2 10l4.5-3L8 8l1.5-1L14 10"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              Inbox
            </button>
            <button
              onClick={() => navigate({ view: 'dashboard' })}
              className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <rect
                  x="2"
                  y="2"
                  width="5"
                  height="5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect
                  x="9"
                  y="2"
                  width="5"
                  height="5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect
                  x="2"
                  y="9"
                  width="5"
                  height="5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <rect
                  x="9"
                  y="9"
                  width="5"
                  height="5"
                  rx="1"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
              </svg>
              Dashboard
            </button>
            <button
              onClick={() => navigate({ view: 'execution-history' })}
              className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="8"
                  cy="8"
                  r="6"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M8 4v4l3 2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              History
            </button>
            <button
              onClick={() => navigate({ view: 'settings' })}
              className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <circle
                  cx="8"
                  cy="8"
                  r="2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M8 2v2M8 12v2M2 8h2M12 8h2M3.76 3.76l1.41 1.41M10.83 10.83l1.41 1.41M3.76 12.24l1.41-1.41M10.83 5.17l1.41-1.41"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              Settings
            </button>
            <button
              onClick={() => navigate({ view: 'marketplace' })}
              className="flex items-center gap-2 rounded-[var(--radius-md)] px-2 py-1.5 text-[var(--text-sm)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-primary)]"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <rect
                  x="2"
                  y="2"
                  width="12"
                  height="12"
                  rx="2"
                  stroke="currentColor"
                  strokeWidth="1.2"
                />
                <path
                  d="M5 8h6M8 5v6"
                  stroke="currentColor"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                />
              </svg>
              Plugins
            </button>
          </nav>
          <Separator />
          <SidebarFlowList />
          <Separator />
          <div className="p-3">
            <button
              onClick={toggleSidebar}
              className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
              title="Collapse sidebar"
            >
              <svg className="h-4 w-4" viewBox="0 0 16 16" fill="none">
                <path
                  d="M10 3L5 8l5 5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </button>
          </div>
        </>
      )}
    </motion.aside>
  )
}
