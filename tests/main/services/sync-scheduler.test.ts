import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { SyncScheduler } from '../../../src/main/services/sync-scheduler'

function makeMockRepos() {
  return {
    plugin: {
      get: vi.fn().mockReturnValue({ id: 'p1', enabled: true }),
    },
    pluginSync: {
      getOrCreate: vi.fn(),
      get: vi.fn().mockReturnValue({ pluginId: 'p1', dataSourceId: 'ds1', syncStatus: 'idle' }),
      listAll: vi.fn().mockReturnValue([]),
      listByPlugin: vi.fn().mockReturnValue([]),
      markSyncing: vi.fn(),
      markComplete: vi.fn(),
      markError: vi.fn(),
    },
    inbox: {
      list: vi.fn().mockReturnValue([]),
      update: vi.fn(),
      unsnoozeExpired: vi.fn().mockReturnValue(0),
    },
  }
}

function makeMockWindow() {
  return {
    webContents: {
      send: vi.fn(),
    },
  } as any
}

function makeMockPluginManager() {
  return {
    callDataSource: vi.fn().mockResolvedValue({ itemsSynced: 5 }),
    callAction: vi.fn(),
  } as any
}

function makeMockAiRegistry() {
  return {
    getDefault: vi.fn().mockReturnValue(null),
  } as any
}

function makeMockAiOpsRepo() {
  return {
    create: vi.fn(),
  } as any
}

describe('SyncScheduler', () => {
  let scheduler: SyncScheduler
  let repos: ReturnType<typeof makeMockRepos>
  let mainWindow: ReturnType<typeof makeMockWindow>
  let pluginManager: ReturnType<typeof makeMockPluginManager>
  let getMainWindow: ReturnType<typeof vi.fn>

  beforeEach(() => {
    vi.useFakeTimers()
    vi.clearAllMocks()
    repos = makeMockRepos()
    mainWindow = makeMockWindow()
    getMainWindow = vi.fn().mockReturnValue(mainWindow)
    pluginManager = makeMockPluginManager()

    scheduler = new SyncScheduler(repos as any, getMainWindow)
    scheduler.setPluginManager(pluginManager)
  })

  afterEach(() => {
    scheduler.stop()
    vi.useRealTimers()
  })

  describe('start / stop', () => {
    it('starts unsnooze timer on start', () => {
      scheduler.start()

      repos.inbox.unsnoozeExpired.mockReturnValue(3)
      vi.advanceTimersByTime(60_000)

      expect(repos.inbox.unsnoozeExpired).toHaveBeenCalled()
    })

    it('sends inbox:updated when items are unsnoozed', () => {
      scheduler.start()
      repos.inbox.unsnoozeExpired.mockReturnValue(2)

      vi.advanceTimersByTime(60_000)

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('inbox:updated', { unsnoozed: 2 })
    })

    it('does not send inbox:updated when no items unsnoozed', () => {
      scheduler.start()
      repos.inbox.unsnoozeExpired.mockReturnValue(0)

      vi.advanceTimersByTime(60_000)

      expect(mainWindow.webContents.send).not.toHaveBeenCalledWith(
        'inbox:updated',
        expect.anything(),
      )
    })

    it('clears all timers on stop', () => {
      scheduler.registerDataSource('p1', 'ds1', 30_000)
      scheduler.start()
      scheduler.stop()

      // After stop, no syncs should fire
      vi.advanceTimersByTime(300_000)
      expect(pluginManager.callDataSource).not.toHaveBeenCalled()
    })
  })

  describe('registerDataSource', () => {
    it('creates a sync interval for positive intervalMs', async () => {
      scheduler.registerDataSource('p1', 'ds1', 30_000)

      await vi.advanceTimersByTimeAsync(30_000)

      expect(repos.pluginSync.markSyncing).toHaveBeenCalledWith('p1', 'ds1')
      expect(pluginManager.callDataSource).toHaveBeenCalledWith('p1', 'ds1', 'sync')
    })

    it('does not create interval for zero intervalMs', async () => {
      scheduler.registerDataSource('p1', 'ds1', 0)

      await vi.advanceTimersByTimeAsync(300_000)

      expect(pluginManager.callDataSource).not.toHaveBeenCalled()
    })

    it('replaces existing interval when re-registered', async () => {
      scheduler.registerDataSource('p1', 'ds1', 60_000)
      scheduler.registerDataSource('p1', 'ds1', 10_000)

      pluginManager.callDataSource.mockClear()

      await vi.advanceTimersByTimeAsync(10_000)
      expect(pluginManager.callDataSource).toHaveBeenCalledTimes(1)
    })

    it('calls getOrCreate on pluginSync repo', () => {
      scheduler.registerDataSource('p1', 'ds1', 30_000)
      expect(repos.pluginSync.getOrCreate).toHaveBeenCalledWith('p1', 'ds1')
    })
  })

  describe('unregisterDataSource', () => {
    it('clears timer for a specific data source', async () => {
      scheduler.registerDataSource('p1', 'ds1', 10_000)
      scheduler.unregisterDataSource('p1', 'ds1')

      await vi.advanceTimersByTimeAsync(30_000)

      expect(pluginManager.callDataSource).not.toHaveBeenCalled()
    })

    it('handles unregister of non-existent key gracefully', () => {
      expect(() => scheduler.unregisterDataSource('unknown', 'ds')).not.toThrow()
    })
  })

  describe('unregisterPlugin', () => {
    it('clears all data sources for a plugin', async () => {
      scheduler.registerDataSource('p1', 'ds1', 10_000)
      scheduler.registerDataSource('p1', 'ds2', 10_000)
      scheduler.registerDataSource('p2', 'ds3', 10_000)

      scheduler.unregisterPlugin('p1')

      pluginManager.callDataSource.mockClear()
      await vi.advanceTimersByTimeAsync(10_000)

      // Only p2:ds3 should fire
      expect(pluginManager.callDataSource).toHaveBeenCalledTimes(1)
      expect(pluginManager.callDataSource).toHaveBeenCalledWith('p2', 'ds3', 'sync')
    })
  })

  describe('triggerSync', () => {
    it('runs sync for all data sources of a plugin', async () => {
      repos.pluginSync.listByPlugin.mockReturnValue([
        { pluginId: 'p1', dataSourceId: 'ds1' },
        { pluginId: 'p1', dataSourceId: 'ds2' },
      ])

      await scheduler.triggerSync('p1')

      expect(pluginManager.callDataSource).toHaveBeenCalledTimes(2)
      expect(pluginManager.callDataSource).toHaveBeenCalledWith('p1', 'ds1', 'sync')
      expect(pluginManager.callDataSource).toHaveBeenCalledWith('p1', 'ds2', 'sync')
    })

    it('handles empty data source list', async () => {
      repos.pluginSync.listByPlugin.mockReturnValue([])

      await scheduler.triggerSync('p1')

      expect(pluginManager.callDataSource).not.toHaveBeenCalled()
    })
  })

  describe('runSync (through timer)', () => {
    it('sends sync-progress and sync-complete on success', async () => {
      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(mainWindow.webContents.send).toHaveBeenCalledWith('plugin:sync-progress', {
        pluginId: 'p1',
        dataSourceId: 'ds1',
        progress: 0,
      })
      expect(mainWindow.webContents.send).toHaveBeenCalledWith('plugin:sync-complete', {
        pluginId: 'p1',
        dataSourceId: 'ds1',
        itemsSynced: 5,
      })
    })

    it('sends sync-error on failure', async () => {
      pluginManager.callDataSource.mockRejectedValueOnce(new Error('network error'))
      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(repos.pluginSync.markError).toHaveBeenCalledWith('p1', 'ds1', 'network error')
      expect(mainWindow.webContents.send).toHaveBeenCalledWith('plugin:sync-error', {
        pluginId: 'p1',
        dataSourceId: 'ds1',
        error: 'network error',
      })
    })

    it('skips sync if already syncing', async () => {
      repos.pluginSync.get.mockReturnValue({
        pluginId: 'p1',
        dataSourceId: 'ds1',
        syncStatus: 'syncing',
      })

      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(pluginManager.callDataSource).not.toHaveBeenCalled()
    })

    it('skips sync if syncState not found', async () => {
      repos.pluginSync.get.mockReturnValue(null)

      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(pluginManager.callDataSource).not.toHaveBeenCalled()
    })

    it('throws error if pluginManager not set', async () => {
      const scheduler2 = new SyncScheduler(repos as any, getMainWindow)
      // Don't call setPluginManager

      scheduler2.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(repos.pluginSync.markError).toHaveBeenCalledWith(
        'p1',
        'ds1',
        'PluginManager not set on SyncScheduler',
      )

      scheduler2.stop()
    })

    it('extracts itemsSynced from result', async () => {
      pluginManager.callDataSource.mockResolvedValueOnce({ itemsSynced: 42 })
      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'plugin:sync-complete',
        expect.objectContaining({ itemsSynced: 42 }),
      )
    })

    it('defaults itemsSynced to 0 if not in result', async () => {
      pluginManager.callDataSource.mockResolvedValueOnce('ok')
      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(mainWindow.webContents.send).toHaveBeenCalledWith(
        'plugin:sync-complete',
        expect.objectContaining({ itemsSynced: 0 }),
      )
    })
  })

  describe('refreshJobs', () => {
    it('registers jobs for enabled plugins on startup', async () => {
      repos.pluginSync.listAll.mockReturnValue([
        { pluginId: 'p1', dataSourceId: 'ds1' },
      ])
      repos.plugin.get.mockReturnValue({ id: 'p1', enabled: true })

      scheduler.start()

      // Default interval is 5 minutes
      await vi.advanceTimersByTimeAsync(300_000)

      expect(pluginManager.callDataSource).toHaveBeenCalledWith('p1', 'ds1', 'sync')
    })

    it('skips disabled plugins', async () => {
      repos.pluginSync.listAll.mockReturnValue([
        { pluginId: 'p1', dataSourceId: 'ds1' },
      ])
      repos.plugin.get.mockReturnValue({ id: 'p1', enabled: false })

      scheduler.start()

      await vi.advanceTimersByTimeAsync(600_000)

      expect(pluginManager.callDataSource).not.toHaveBeenCalled()
    })

    it('skips plugins not found in repo', async () => {
      repos.pluginSync.listAll.mockReturnValue([
        { pluginId: 'p-missing', dataSourceId: 'ds1' },
      ])
      repos.plugin.get.mockReturnValue(null)

      scheduler.start()

      await vi.advanceTimersByTimeAsync(600_000)

      expect(pluginManager.callDataSource).not.toHaveBeenCalled()
    })
  })

  describe('post-sync classification', () => {
    it('runs classification after successful sync', async () => {
      const mockProvider = {
        id: 'claude',
        isAvailable: vi.fn().mockResolvedValue(true),
        classify: vi.fn().mockResolvedValue({
          results: [{ itemId: 'item-1', label: 'important', confidence: 0.9, reasoning: 'test' }],
          model: 'claude-sonnet',
          inputTokens: 100,
          outputTokens: 50,
        }),
      }
      const aiRegistry = makeMockAiRegistry()
      aiRegistry.getDefault.mockReturnValue(mockProvider)
      const aiOpsRepo = makeMockAiOpsRepo()

      scheduler.setAIRegistry(aiRegistry)
      scheduler.setAiOpsRepo(aiOpsRepo)

      repos.inbox.list.mockReturnValue([
        { id: 'item-1', title: 'Test', body: 'body', preview: 'prev', aiClassification: null },
      ])

      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      // Wait for classification promise
      await vi.advanceTimersByTimeAsync(0)

      expect(mockProvider.classify).toHaveBeenCalled()
      expect(repos.inbox.update).toHaveBeenCalledWith('item-1', {
        aiClassification: expect.stringContaining('important'),
      })
      expect(aiOpsRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'claude',
          operation: 'classify',
        }),
      )
    })

    it('skips classification when no AI provider available', async () => {
      const aiRegistry = makeMockAiRegistry()
      aiRegistry.getDefault.mockReturnValue(null)
      scheduler.setAIRegistry(aiRegistry)

      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(repos.inbox.list).not.toHaveBeenCalled()
    })

    it('skips classification when provider is not available', async () => {
      const mockProvider = {
        id: 'claude',
        isAvailable: vi.fn().mockResolvedValue(false),
      }
      const aiRegistry = makeMockAiRegistry()
      aiRegistry.getDefault.mockReturnValue(mockProvider)
      scheduler.setAIRegistry(aiRegistry)
      scheduler.setAiOpsRepo(makeMockAiOpsRepo())

      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)

      expect(repos.inbox.list).not.toHaveBeenCalled()
    })

    it('skips when all items already classified', async () => {
      const mockProvider = {
        id: 'claude',
        isAvailable: vi.fn().mockResolvedValue(true),
        classify: vi.fn(),
      }
      const aiRegistry = makeMockAiRegistry()
      aiRegistry.getDefault.mockReturnValue(mockProvider)
      scheduler.setAIRegistry(aiRegistry)
      scheduler.setAiOpsRepo(makeMockAiOpsRepo())

      repos.inbox.list.mockReturnValue([
        { id: 'item-1', aiClassification: '{"label":"fyi"}' },
      ])

      scheduler.registerDataSource('p1', 'ds1', 10_000)

      await vi.advanceTimersByTimeAsync(10_000)
      await vi.advanceTimersByTimeAsync(0)

      expect(mockProvider.classify).not.toHaveBeenCalled()
    })
  })

  describe('setPluginManager / setAIRegistry / setAiOpsRepo', () => {
    it('sets plugin manager', () => {
      const pm = makeMockPluginManager()
      const s = new SyncScheduler(repos as any, getMainWindow)
      expect(() => s.setPluginManager(pm)).not.toThrow()
    })

    it('sets AI registry', () => {
      const reg = makeMockAiRegistry()
      expect(() => scheduler.setAIRegistry(reg)).not.toThrow()
    })

    it('sets AI ops repo', () => {
      const repo = makeMockAiOpsRepo()
      expect(() => scheduler.setAiOpsRepo(repo)).not.toThrow()
    })
  })
})
