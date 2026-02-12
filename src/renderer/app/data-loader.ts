import { loadBootstrapCache, saveBootstrapCache } from './bootstrap'
import { useUIStore } from './stores/ui-store'
import { useWorkspaceStore } from '@entities/workspace'
import { useFlowStore } from '@entities/flow'
import { useInboxStore } from '@entities/inbox-item'
import { usePluginStore } from '@entities/plugin'

export function loadTier1(): void {
  const cache = loadBootstrapCache()
  if (cache.theme) {
    useUIStore.getState().setTheme(cache.theme)
  }
  if (cache.lastWorkspaceId) {
    useWorkspaceStore.getState().setActiveWorkspace(cache.lastWorkspaceId)
  }
}

export async function loadTier2(): Promise<void> {
  await useWorkspaceStore.getState().loadWorkspaces()
  const wsId = useWorkspaceStore.getState().activeWorkspaceId
  if (wsId) {
    await useFlowStore.getState().loadFlows(wsId)
    saveBootstrapCache({
      lastWorkspaceId: wsId,
      theme: useUIStore.getState().theme,
      sidebarCollapsed: useUIStore.getState().sidebarCollapsed
    })
  }
  // Load inbox and plugin data after workspace is ready
  await loadTier3()
}

export async function loadTier3(): Promise<void> {
  // Load inbox and plugin data (Phase 2)
  await Promise.all([
    useInboxStore.getState().loadItems(),
    useInboxStore.getState().loadStats(),
    usePluginStore.getState().loadPlugins()
  ])
}
