import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Search, X, Puzzle } from 'lucide-react'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogTitle, Input } from '@shared/ui'
import { usePluginStore, discoverAvailablePlugins } from '@entities/plugin'
import type { AvailablePlugin } from '@entities/plugin'
import { oauthStatus, oauthSupports } from '@features/plugin-onboarding/lib/oauth-ipc'
import { PluginGrid } from './PluginGrid'
import { PluginSetupFlow } from './PluginSetupFlow'

type ConnectionStatus = 'available' | 'installed' | 'connected'

interface PluginHubDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function PluginHubDialog({ open, onOpenChange }: PluginHubDialogProps) {
  const [plugins, setPlugins] = useState<AvailablePlugin[]>([])
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, ConnectionStatus>>({})
  const [searchQuery, setSearchQuery] = useState('')
  const [loading, setLoading] = useState(true)
  const [installingId, setInstallingId] = useState<string | null>(null)
  const [uninstallingId, setUninstallingId] = useState<string | null>(null)
  const [setupPlugin, setSetupPlugin] = useState<AvailablePlugin | null>(null)

  const loadPlugins = usePluginStore((s) => s.loadPlugins)
  const storeInstall = usePluginStore((s) => s.installPlugin)
  const enablePlugin = usePluginStore((s) => s.enablePlugin)

  // Load available plugins and their connection statuses
  const loadAvailable = useCallback(async () => {
    setLoading(true)
    try {
      const available = await discoverAvailablePlugins()
      setPlugins(available)

      // Determine connection status for each plugin
      const statuses: Record<string, ConnectionStatus> = {}
      for (const plugin of available) {
        if (!plugin.installed) {
          statuses[plugin.id] = 'available'
          continue
        }

        // Check if OAuth connected
        if (plugin.authType === 'oauth') {
          try {
            const supports = await oauthSupports(plugin.id)
            if (supports) {
              const status = await oauthStatus(plugin.id)
              statuses[plugin.id] = status.connected ? 'connected' : 'installed'
              continue
            }
          } catch { /* fall through */ }
        }

        // For non-oauth or failed check, mark as installed if enabled
        statuses[plugin.id] = plugin.enabled ? 'connected' : 'installed'
      }

      setConnectionStatuses(statuses)
    } catch {
      toast.error('Failed to load plugins')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (open) {
      loadAvailable()
      setSearchQuery('')
      setSetupPlugin(null)
    }
  }, [open, loadAvailable])

  const handleInstall = useCallback(async (plugin: AvailablePlugin) => {
    setInstallingId(plugin.id)
    try {
      // Find the bundled plugin path and install it
      // The install IPC takes a path — we need to discover the path
      // For bundled plugins, the path is in plugins/{id}/
      const paths = [
        `plugins/${plugin.id}`,
      ]

      // Try installing from the bundled plugins directory
      await storeInstall(paths[0])
      await enablePlugin(plugin.id)

      // Update local state
      setPlugins((prev) =>
        prev.map((p) =>
          p.id === plugin.id ? { ...p, installed: true, enabled: true } : p
        )
      )
      setConnectionStatuses((prev) => ({
        ...prev,
        [plugin.id]: 'installed'
      }))

      toast.success(`${plugin.name} installed`)

      // Auto-open setup flow
      setSetupPlugin({ ...plugin, installed: true, enabled: true })
    } catch (err) {
      toast.error(`Failed to install ${plugin.name}: ${err instanceof Error ? err.message : String(err)}`)
    } finally {
      setInstallingId(null)
    }
  }, [storeInstall, enablePlugin])

  const handleUninstall = useCallback(async (plugin: AvailablePlugin) => {
    if (!window.confirm(`Uninstall ${plugin.name}? This will remove all plugin data and settings.`)) return
    setUninstallingId(plugin.id)
    try {
      await usePluginStore.getState().uninstallPlugin(plugin.id)
      setPlugins((prev) =>
        prev.map((p) =>
          p.id === plugin.id ? { ...p, installed: false, enabled: false } : p
        )
      )
      setConnectionStatuses((prev) => ({
        ...prev,
        [plugin.id]: 'available'
      }))
      toast.success(`${plugin.name} uninstalled`)
    } catch {
      toast.error(`Failed to uninstall ${plugin.name}`)
    } finally {
      setUninstallingId(null)
    }
  }, [])

  const handleSetup = useCallback((plugin: AvailablePlugin) => {
    setSetupPlugin(plugin)
  }, [])

  const handleSetupComplete = useCallback(() => {
    if (setupPlugin) {
      setConnectionStatuses((prev) => ({
        ...prev,
        [setupPlugin.id]: 'connected'
      }))
    }
    setSetupPlugin(null)
    // Refresh store
    loadPlugins()
  }, [setupPlugin, loadPlugins])

  const handleSetupBack = useCallback(() => {
    setSetupPlugin(null)
  }, [])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Plugin Hub</DialogTitle>
        <AnimatePresence mode="wait">
          {setupPlugin ? (
            <motion.div
              key="setup"
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -40 }}
              transition={{ duration: 0.2 }}
            >
              <PluginSetupFlow
                plugin={setupPlugin}
                onBack={handleSetupBack}
                onComplete={handleSetupComplete}
              />
            </motion.div>
          ) : (
            <motion.div
              key="grid"
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              transition={{ duration: 0.2 }}
            >
              {/* Header */}
              <div className="flex items-center justify-between border-b border-[var(--color-border-subtle)] px-6 py-4">
                <div className="flex items-center gap-2.5">
                  <Puzzle className="h-5 w-5 text-[var(--color-accent-primary)]" />
                  <h2 className="text-[var(--text-base)] font-semibold text-[var(--color-text-primary)]">
                    Plugin Hub
                  </h2>
                </div>
                <button
                  onClick={() => onOpenChange(false)}
                  className="flex h-7 w-7 items-center justify-center rounded-[var(--radius-md)] text-[var(--color-text-tertiary)] hover:bg-[var(--color-bg-hover)] hover:text-[var(--color-text-secondary)]"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Search */}
              <div className="px-6 py-3">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--color-text-quaternary)]" />
                  <Input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search plugins..."
                    className="h-8 pl-9 text-[var(--text-xs)]"
                  />
                </div>
              </div>

              {/* Grid */}
              <div className="max-h-[400px] overflow-y-auto px-6 pb-6">
                {loading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="flex items-center gap-2 text-[var(--text-sm)] text-[var(--color-text-tertiary)]">
                      <motion.div
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      >
                        <Puzzle className="h-4 w-4" />
                      </motion.div>
                      Discovering plugins...
                    </div>
                  </div>
                ) : (
                  <PluginGrid
                    plugins={plugins}
                    connectionStatuses={connectionStatuses}
                    searchQuery={searchQuery}
                    onInstall={handleInstall}
                    onSetup={handleSetup}
                    onUninstall={handleUninstall}
                    installingId={installingId}
                    uninstallingId={uninstallingId}
                  />
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  )
}
