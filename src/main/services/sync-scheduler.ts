import type { BrowserWindow } from 'electron'
import type { PluginRepository } from '../db/repositories/plugin.repository'
import type { PluginSyncRepository } from '../db/repositories/plugin-sync.repository'
import type { InboxRepository } from '../db/repositories/inbox.repository'
import type { PluginManager } from '../plugins/plugin-manager'

interface SyncSchedulerDeps {
  plugin: PluginRepository
  pluginSync: PluginSyncRepository
  inbox: InboxRepository
}

interface SyncJob {
  pluginId: string
  dataSourceId: string
  intervalMs: number
  timerId: ReturnType<typeof setInterval> | null
}

/**
 * SyncScheduler manages periodic data source syncs for all enabled plugins.
 * Each plugin data source runs on its own configurable interval.
 *
 * The scheduler:
 * 1. Reads registered data sources from plugin_sync_state
 * 2. Creates interval timers for each active data source
 * 3. Sends sync-progress / sync-complete events to the renderer
 * 4. Handles unsnooze checks on a periodic interval
 */
export class SyncScheduler {
  private jobs = new Map<string, SyncJob>()
  private unsnoozeTimerId: ReturnType<typeof setInterval> | null = null
  private repos: SyncSchedulerDeps
  private getMainWindow: () => BrowserWindow | null
  private pluginManager: PluginManager | null = null

  constructor(
    repos: SyncSchedulerDeps,
    getMainWindow: () => BrowserWindow | null
  ) {
    this.repos = repos
    this.getMainWindow = getMainWindow
  }

  /** Set the plugin manager reference (avoids circular dependency in construction). */
  setPluginManager(pm: PluginManager): void {
    this.pluginManager = pm
  }

  /** Start the scheduler. Call once at app startup. */
  start(): void {
    // Check for unsnoozed items every 60 seconds
    this.unsnoozeTimerId = setInterval(() => {
      this.checkUnsnooze()
    }, 60_000)

    // Initial load of registered sync states
    this.refreshJobs()
  }

  /** Stop all scheduled syncs. Call at app shutdown. */
  stop(): void {
    if (this.unsnoozeTimerId) {
      clearInterval(this.unsnoozeTimerId)
      this.unsnoozeTimerId = null
    }
    for (const job of this.jobs.values()) {
      if (job.timerId) clearInterval(job.timerId)
    }
    this.jobs.clear()
  }

  /** Register or update a data source sync schedule. */
  registerDataSource(
    pluginId: string,
    dataSourceId: string,
    intervalMs: number
  ): void {
    const key = `${pluginId}:${dataSourceId}`
    const existing = this.jobs.get(key)
    if (existing?.timerId) {
      clearInterval(existing.timerId)
    }

    // Ensure sync state record exists
    this.repos.pluginSync.getOrCreate(pluginId, dataSourceId)

    const job: SyncJob = {
      pluginId,
      dataSourceId,
      intervalMs,
      timerId: null
    }

    if (intervalMs > 0) {
      job.timerId = setInterval(() => {
        this.runSync(pluginId, dataSourceId)
      }, intervalMs)
    }

    this.jobs.set(key, job)
  }

  /** Unregister a data source from the scheduler. */
  unregisterDataSource(pluginId: string, dataSourceId: string): void {
    const key = `${pluginId}:${dataSourceId}`
    const job = this.jobs.get(key)
    if (job?.timerId) {
      clearInterval(job.timerId)
    }
    this.jobs.delete(key)
  }

  /** Unregister all data sources for a plugin. */
  unregisterPlugin(pluginId: string): void {
    for (const [key, job] of this.jobs.entries()) {
      if (job.pluginId === pluginId) {
        if (job.timerId) clearInterval(job.timerId)
        this.jobs.delete(key)
      }
    }
  }

  /** Manually trigger a sync for a specific plugin. */
  async triggerSync(pluginId: string): Promise<void> {
    const syncStates = this.repos.pluginSync.listByPlugin(pluginId)
    for (const state of syncStates) {
      await this.runSync(pluginId, state.dataSourceId)
    }
  }

  /** Load registered jobs from the database on startup. */
  private refreshJobs(): void {
    const allStates = this.repos.pluginSync.listAll()
    for (const state of allStates) {
      // Check if plugin is enabled
      const plugin = this.repos.plugin.get(state.pluginId)
      if (!plugin || !plugin.enabled) continue

      // Use default interval if not already registered
      const key = `${state.pluginId}:${state.dataSourceId}`
      if (!this.jobs.has(key)) {
        // Default to 5 minute sync for unknown intervals
        this.registerDataSource(state.pluginId, state.dataSourceId, 5 * 60_000)
      }
    }
  }

  /**
   * Run a sync for a specific data source.
   * This is a placeholder — actual sync execution will be delegated to the
   * plugin sandbox (task #6) which calls plugin.sync() and writes items
   * via storeItems().
   */
  private async runSync(
    pluginId: string,
    dataSourceId: string
  ): Promise<void> {
    const syncState = this.repos.pluginSync.get(pluginId, dataSourceId)
    if (!syncState) return

    // Don't start a new sync if one is already running
    if (syncState.syncStatus === 'syncing') return

    // Mark as syncing
    this.repos.pluginSync.markSyncing(pluginId, dataSourceId)

    const mainWindow = this.getMainWindow()
    mainWindow?.webContents.send('plugin:sync-progress', {
      pluginId,
      dataSourceId,
      progress: 0
    })

    try {
      if (!this.pluginManager) {
        throw new Error('PluginManager not set on SyncScheduler')
      }

      // Delegate to plugin sandbox to fetch data
      const result = await this.pluginManager.callDataSource(pluginId, dataSourceId, 'sync')

      // Extract item count from result if available
      const itemsSynced = typeof result === 'object' && result !== null && 'itemsSynced' in result
        ? (result as { itemsSynced: number }).itemsSynced
        : 0

      this.repos.pluginSync.markComplete(pluginId, dataSourceId)

      mainWindow?.webContents.send('plugin:sync-complete', {
        pluginId,
        dataSourceId,
        itemsSynced
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.repos.pluginSync.markError(pluginId, dataSourceId, message)

      mainWindow?.webContents.send('plugin:sync-error', {
        pluginId,
        dataSourceId,
        error: message
      })
    }
  }

  /** Check for snoozed items that should be unsnoozed. */
  private checkUnsnooze(): void {
    const unsnoozed = this.repos.inbox.unsnoozeExpired()
    if (unsnoozed > 0) {
      const mainWindow = this.getMainWindow()
      mainWindow?.webContents.send('inbox:updated', { unsnoozed })
    }
  }
}
