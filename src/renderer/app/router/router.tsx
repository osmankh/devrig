import { lazy, Suspense } from 'react'
import { create } from 'zustand'
import type { Route } from './routes'
import { DEFAULT_ROUTE } from './routes'

interface RouterState {
  route: Route
  navigate: (route: Route) => void
}

export const useRouterStore = create<RouterState>()((set) => ({
  route: DEFAULT_ROUTE,
  navigate: (route) => set({ route })
}))

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
      {route.view === 'dashboard' && <DashboardPage />}
      {route.view === 'flow-editor' && <FlowEditorPage />}
      {route.view === 'execution-history' && <ExecutionHistoryPage />}
      {route.view === 'settings' && <SettingsPage />}
    </Suspense>
  )
}
