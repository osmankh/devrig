import { lazy, Suspense } from 'react'
import { create } from 'zustand'
import { DEFAULT_ROUTE, type Route } from './routes'

interface RouterState {
  route: Route
  navigate: (route: Route) => void
}

export const useRouterStore = create<RouterState>()((set) => ({
  route: DEFAULT_ROUTE,
  navigate: (route) => set({ route })
}))

const InboxPage = lazy(() =>
  import('@pages/inbox').then((m) => ({ default: m.InboxPage }))
)
const DashboardPage = lazy(() =>
  import('@pages/dashboard').then((m) => ({ default: m.DashboardPage }))
)
const FlowEditorPage = lazy(() =>
  import('@pages/flow-editor').then((m) => ({ default: m.FlowEditorPage }))
)
const ExecutionHistoryPage = lazy(() =>
  import('@pages/execution-history').then((m) => ({
    default: m.ExecutionHistoryPage
  }))
)
const SettingsPage = lazy(() =>
  import('@pages/settings').then((m) => ({ default: m.SettingsPage }))
)
const MarketplacePage = lazy(() =>
  import('@pages/marketplace').then((m) => ({ default: m.MarketplacePage }))
)

function PageSkeleton() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-accent-primary)] border-t-transparent" />
    </div>
  )
}

export function AppRouter() {
  const route = useRouterStore((s) => s.route)

  return (
    <Suspense fallback={<PageSkeleton />}>
      {route.view === 'inbox' && <InboxPage />}
      {route.view === 'dashboard' && <DashboardPage />}
      {route.view === 'flow-editor' && <FlowEditorPage />}
      {route.view === 'execution-history' && <ExecutionHistoryPage />}
      {route.view === 'settings' && <SettingsPage />}
      {route.view === 'marketplace' && <MarketplacePage />}
    </Suspense>
  )
}
