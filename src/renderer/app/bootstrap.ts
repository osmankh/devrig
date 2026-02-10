const BOOTSTRAP_KEY = 'devrig_bootstrap'

interface BootstrapCache {
  lastWorkspaceId?: string
  theme?: 'dark' | 'light' | 'system'
  sidebarCollapsed?: boolean
}

export function loadBootstrapCache(): BootstrapCache {
  try {
    const raw = localStorage.getItem(BOOTSTRAP_KEY)
    if (!raw) return {}
    return JSON.parse(raw) as BootstrapCache
  } catch {
    return {}
  }
}

export function saveBootstrapCache(cache: BootstrapCache): void {
  try {
    localStorage.setItem(BOOTSTRAP_KEY, JSON.stringify(cache))
  } catch {
    // localStorage may be unavailable
  }
}
