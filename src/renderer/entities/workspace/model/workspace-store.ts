import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Workspace } from './workspace.types'
import * as api from '../api/workspace-ipc'

interface WorkspaceState {
  workspaces: Workspace[]
  activeWorkspaceId: string | null
  isLoading: boolean

  loadWorkspaces: () => Promise<void>
  setActiveWorkspace: (id: string) => void
  createWorkspace: (name: string) => Promise<Workspace>
}

export const useWorkspaceStore = create<WorkspaceState>()(
  immer((set, get) => ({
    workspaces: [],
    activeWorkspaceId: null,
    isLoading: false,

    loadWorkspaces: async () => {
      set((s) => {
        s.isLoading = true
      })
      try {
        const workspaces = await api.listWorkspaces()
        if (workspaces.length === 0) {
          // Auto-create default workspace
          const defaultWs = await api.createWorkspace({ name: 'Default' })
          set((s) => {
            s.workspaces = [defaultWs]
            s.activeWorkspaceId = defaultWs.id
            s.isLoading = false
          })
        } else {
          set((s) => {
            s.workspaces = workspaces
            if (!s.activeWorkspaceId) {
              s.activeWorkspaceId = workspaces[0].id
            }
            s.isLoading = false
          })
        }
      } catch {
        set((s) => {
          s.isLoading = false
        })
      }
    },

    setActiveWorkspace: (id) => {
      set((s) => {
        s.activeWorkspaceId = id
      })
    },

    createWorkspace: async (name) => {
      const ws = await api.createWorkspace({ name })
      set((s) => {
        s.workspaces.push(ws)
      })
      return ws
    }
  }))
)
