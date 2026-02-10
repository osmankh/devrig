import { loadBootstrapCache, saveBootstrapCache } from './bootstrap'
import { useUIStore } from './stores/ui-store'
import { useWorkspaceStore } from '@entities/workspace'
import { useFlowStore } from '@entities/flow'

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
}

export function loadTier3(): void {
  // Deferred loading - not yet needed for Phase 1
}
