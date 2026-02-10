import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'

type Theme = 'dark' | 'light' | 'system'

interface UIState {
  theme: Theme
  sidebarCollapsed: boolean
  sidebarWidth: number
  propertyPanelOpen: boolean

  setTheme: (theme: Theme) => void
  toggleSidebar: () => void
  setSidebarWidth: (width: number) => void
  setPropertyPanelOpen: (open: boolean) => void
}

export const useUIStore = create<UIState>()(
  persist(
    immer((set) => ({
      theme: 'dark' as Theme,
      sidebarCollapsed: false,
      sidebarWidth: 240,
      propertyPanelOpen: false,

      setTheme: (theme) => {
        set((s) => {
          s.theme = theme
        })
      },

      toggleSidebar: () => {
        set((s) => {
          s.sidebarCollapsed = !s.sidebarCollapsed
        })
      },

      setSidebarWidth: (width) => {
        set((s) => {
          s.sidebarWidth = width
        })
      },

      setPropertyPanelOpen: (open) => {
        set((s) => {
          s.propertyPanelOpen = open
        })
      }
    })),
    {
      name: 'devrig-ui',
      partialize: (state) => ({
        theme: state.theme,
        sidebarCollapsed: state.sidebarCollapsed,
        sidebarWidth: state.sidebarWidth
      })
    }
  )
)
