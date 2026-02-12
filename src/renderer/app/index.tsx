import { useEffect } from 'react'
import { ThemeProvider } from './providers/ThemeProvider'
import { AppRouter, useRouterStore } from './router/router'
import { AppLayout } from '@widgets/layout'
import { Toaster } from '@shared/ui'
import { TooltipProvider } from '@shared/ui/tooltip'
import { useUIStore } from './stores/ui-store'
import { loadTier1, loadTier2, loadTier3 } from './data-loader'
import { initExecutionSubscriptions } from '@entities/execution'
import { CommandPalette } from '@widgets/command-palette'
import { initKeyboardShortcuts, useShortcutStore } from '@features/keyboard-shortcuts'
import { OnboardingDialog } from '@features/onboarding'
import { useNotifications } from '@features/notifications'

// Apply bootstrap cache before React renders
loadTier1()

function useRegisterNavShortcuts() {
  const navigate = useRouterStore((s) => s.navigate)
  const register = useShortcutStore((s) => s.register)

  useEffect(() => {
    register({
      id: 'nav-inbox',
      keys: 'mod+1',
      label: 'Go to Inbox',
      category: 'Navigation',
      action: () => navigate({ view: 'inbox' })
    })
    register({
      id: 'nav-dashboard',
      keys: 'mod+2',
      label: 'Go to Dashboard',
      category: 'Navigation',
      action: () => navigate({ view: 'dashboard' })
    })
    register({
      id: 'nav-settings',
      keys: 'mod+,',
      label: 'Open Settings',
      category: 'Navigation',
      action: () => navigate({ view: 'settings' })
    })
  }, [navigate, register])
}

export function App() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    loadTier2().then(() => loadTier3())
    initExecutionSubscriptions()
    return initKeyboardShortcuts()
  }, [])

  useRegisterNavShortcuts()
  useNotifications()

  return (
    <ThemeProvider theme={theme}>
      <TooltipProvider delayDuration={300}>
        <div className="flex h-full flex-col">
          {/* Titlebar drag region */}
          <div className="titlebar-drag flex h-[var(--titlebar-height)] shrink-0 items-center border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)] px-4">
            <span className="titlebar-no-drag text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">
              DevRig
            </span>
          </div>
          {/* Main content */}
          <div className="flex-1 overflow-hidden">
            <AppLayout>
              <AppRouter />
            </AppLayout>
          </div>
        </div>
        <CommandPalette />
        <OnboardingDialog />
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}
