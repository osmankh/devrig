import { useEffect } from 'react'
import { ThemeProvider } from './providers/ThemeProvider'
import { AppRouter } from './router/router'
import { AppLayout } from '@widgets/layout'
import { Toaster } from '@shared/ui'
import { TooltipProvider } from '@shared/ui/tooltip'
import { useUIStore } from './stores/ui-store'
import { loadTier1, loadTier2 } from './data-loader'

// Apply bootstrap cache before React renders
loadTier1()

export function App() {
  const theme = useUIStore((s) => s.theme)

  useEffect(() => {
    loadTier2()
  }, [])

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
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  )
}
