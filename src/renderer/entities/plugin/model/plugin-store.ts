import { create } from 'zustand'
import { immer } from 'zustand/middleware/immer'
import type { Plugin, PluginSyncState } from './plugin.types'
import * as api from '../api/plugin-ipc'

interface PluginState {
  plugins: Record<string, Plugin>
  syncStates: Record<string, PluginSyncState> // key: `${pluginId}:${dataSourceId}`
  isLoading: boolean
  showSetupWizard: string | null

  loadPlugins: () => Promise<void>
  installPlugin: (path: string) => Promise<void>
  uninstallPlugin: (id: string) => Promise<void>
  enablePlugin: (id: string) => Promise<void>
  disablePlugin: (id: string) => Promise<void>
  configurePlugin: (id: string, settings: Record<string, unknown>) => Promise<void>
  triggerSync: (id: string) => Promise<void>
  loadSyncState: (id: string) => Promise<void>
  setShowSetupWizard: (pluginId: string | null) => void
}

export const usePluginStore = create<PluginState>()(
  immer((set, get) => ({
    plugins: {},
    syncStates: {},
    isLoading: false,
    showSetupWizard: null,

    setShowSetupWizard: (pluginId) => {
      set((s) => { s.showSetupWizard = pluginId })
    },

    loadPlugins: async () => {
      set((s) => {
        s.isLoading = true
      })
      try {
        const plugins = await api.listPlugins()
        if (!Array.isArray(plugins)) {
          set((s) => { s.isLoading = false })
          return
        }
        set((s) => {
          s.plugins = {}
          for (const plugin of plugins) {
            s.plugins[plugin.id] = plugin
          }
          s.isLoading = false
        })
      } catch {
        set((s) => {
          s.isLoading = false
        })
      }
    },

    installPlugin: async (path) => {
      const plugin = await api.installPlugin(path)
      set((s) => {
        s.plugins[plugin.id] = plugin
      })
    },

    uninstallPlugin: async (id) => {
      await api.uninstallPlugin(id)
      set((s) => {
        delete s.plugins[id]
        // Remove associated sync states
        for (const key of Object.keys(s.syncStates)) {
          if (key.startsWith(`${id}:`)) {
            delete s.syncStates[key]
          }
        }
      })
    },

    enablePlugin: async (id) => {
      set((s) => {
        if (s.plugins[id]) s.plugins[id].enabled = true
      })
      try {
        await api.enablePlugin(id)
        // Check if plugin needs setup
        const plugin = get().plugins[id]
        if (plugin?.requiredSecrets && plugin.requiredSecrets.length > 0) {
          const results = await Promise.all(
            plugin.requiredSecrets.map((key) => api.hasPluginSecret(id, key))
          )
          if (results.some((has) => !has)) {
            set((s) => { s.showSetupWizard = id })
          }
        }
      } catch {
        set((s) => {
          if (s.plugins[id]) s.plugins[id].enabled = false
        })
      }
    },

    disablePlugin: async (id) => {
      set((s) => {
        if (s.plugins[id]) s.plugins[id].enabled = false
      })
      try {
        await api.disablePlugin(id)
      } catch {
        set((s) => {
          if (s.plugins[id]) s.plugins[id].enabled = true
        })
      }
    },

    configurePlugin: async (id, settings) => {
      await api.configurePlugin(id, settings)
    },

    triggerSync: async (id) => {
      await api.triggerSync(id)
    },

    loadSyncState: async (id) => {
      const states = await api.getSyncState(id)
      if (!Array.isArray(states)) return
      set((s) => {
        for (const state of states) {
          const key = `${state.pluginId}:${state.dataSourceId}`
          s.syncStates[key] = state
        }
      })
    }
  }))
)
