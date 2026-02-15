import { describe, it, expect, vi, beforeEach } from 'vitest'

// Use vi.hoisted so variables are available inside hoisted vi.mock factories
const {
  mockDiscover,
  mockLoadFromPath,
  mockSandboxDispose,
  mockSandboxCall,
  mockSandboxLoadModule,
  mockSandboxGetMemoryUsage,
  mockPluginRepo,
  mockSyncRepo,
  mockInboxRepo,
  mockSettingsRepo
} = vi.hoisted(() => ({
  mockDiscover: vi.fn().mockResolvedValue([]),
  mockLoadFromPath: vi.fn(),
  mockSandboxDispose: vi.fn(),
  mockSandboxCall: vi.fn(),
  mockSandboxLoadModule: vi.fn(),
  mockSandboxGetMemoryUsage: vi.fn().mockReturnValue({ used: 1024, limit: 134217728 }),
  mockPluginRepo: {
    listEnabled: vi.fn().mockReturnValue([]),
    create: vi.fn().mockReturnValue({ id: 'db-id-1' }),
    update: vi.fn(),
    delete: vi.fn(),
    get: vi.fn()
  },
  mockSyncRepo: {
    create: vi.fn(),
    deleteByPlugin: vi.fn()
  },
  mockInboxRepo: {
    deleteByPlugin: vi.fn()
  },
  mockSettingsRepo: {
    get: vi.fn().mockReturnValue(null),
    set: vi.fn(),
    delete: vi.fn()
  }
}))

// Mock electron
vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/mock/userData') }
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn().mockReturnValue(true),
  mkdirSync: vi.fn(),
  cpSync: vi.fn(),
  rmSync: vi.fn()
}))

// Mock PluginLoader — use regular function for `new` compatibility
vi.mock('../../../src/main/plugins/plugin-loader', () => ({
  PluginLoader: vi.fn().mockImplementation(function () {
    return { discover: mockDiscover, loadFromPath: mockLoadFromPath }
  })
}))

// Mock isolate-sandbox
vi.mock('../../../src/main/plugins/isolate-sandbox', () => ({
  createSandbox: vi.fn().mockResolvedValue({
    call: mockSandboxCall,
    loadModule: mockSandboxLoadModule,
    dispose: mockSandboxDispose,
    getMemoryUsage: mockSandboxGetMemoryUsage
  })
}))

// Mock plugin-api
vi.mock('../../../src/main/plugins/plugin-api', () => ({
  createHostFunctions: vi.fn().mockReturnValue({
    fetch: vi.fn(),
    getSecret: vi.fn(),
    storeItems: vi.fn(),
    queryItems: vi.fn(),
    markRead: vi.fn(),
    archive: vi.fn(),
    emitEvent: vi.fn(),
    requestAI: vi.fn()
  })
}))

// Mock manifest-schema
vi.mock('../../../src/main/plugins/manifest-schema', () => ({
  validateManifest: vi.fn().mockReturnValue({
    success: true,
    data: {
      id: 'db-plugin',
      name: 'DB Plugin',
      version: '1.0.0',
      description: 'From DB',
      author: { name: 'Author' }
    }
  })
}))

// Mock permissions
vi.mock('../../../src/main/plugins/permissions', () => ({
  extractPermissions: vi.fn().mockReturnValue({
    network: [],
    secrets: [],
    ai: false,
    filesystem: []
  }),
  validatePermissions: vi.fn().mockReturnValue({ valid: true, warnings: [] })
}))

// Mock repositories — use regular functions (not arrows) so they work with `new`
vi.mock('../../../src/main/db/repositories/plugin.repository', () => ({
  PluginRepository: vi.fn().mockImplementation(function () { return mockPluginRepo })
}))
vi.mock('../../../src/main/db/repositories/plugin-sync.repository', () => ({
  PluginSyncRepository: vi.fn().mockImplementation(function () { return mockSyncRepo })
}))
vi.mock('../../../src/main/db/repositories/inbox.repository', () => ({
  InboxRepository: vi.fn().mockImplementation(function () { return mockInboxRepo })
}))
vi.mock('../../../src/main/db/repositories/settings.repository', () => ({
  SettingsRepository: vi.fn().mockImplementation(function () { return mockSettingsRepo })
}))

// Mock SecretsBridge
vi.mock('../../../src/main/ai', () => ({
  SecretsBridge: vi.fn()
}))

import { existsSync, rmSync } from 'fs'
import { PluginManager } from '../../../src/main/plugins/plugin-manager'
import { createSandbox } from '../../../src/main/plugins/isolate-sandbox'
import { validateManifest } from '../../../src/main/plugins/manifest-schema'
import { validatePermissions } from '../../../src/main/plugins/permissions'
import type { PluginDescriptor } from '../../../src/main/plugins/plugin-loader'

const mockExistsSync = vi.mocked(existsSync)

function makeDescriptor(overrides?: Partial<PluginDescriptor>): PluginDescriptor {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    manifest: {
      id: 'test-plugin',
      name: 'Test Plugin',
      version: '1.0.0',
      description: 'Test',
      author: { name: 'A' }
    },
    path: '/plugins/test-plugin',
    permissions: { network: [], secrets: [], ai: false, filesystem: [] },
    entryPoints: new Map([['sync.js', '// code']]),
    ...overrides
  }
}

describe('PluginManager', () => {
  let manager: PluginManager

  beforeEach(() => {
    vi.clearAllMocks()
    mockPluginRepo.listEnabled.mockReturnValue([])
    mockPluginRepo.create.mockReturnValue({ id: 'db-id-1' })
    mockSettingsRepo.get.mockReturnValue(null)
    mockDiscover.mockResolvedValue([])
    mockExistsSync.mockReturnValue(true)

    manager = new PluginManager({
      db: {} as any,
      pluginsDir: '/test/plugins'
    })
  })

  describe('initialize', () => {
    it('loads plugins from DB and validates their manifests', async () => {
      mockPluginRepo.listEnabled.mockReturnValue([
        { id: 'db-1', name: 'DB Plugin', manifest: '{"id":"db-plugin","name":"DB Plugin","version":"1.0.0","description":"Desc","author":{"name":"A"}}' }
      ])

      await manager.initialize()

      expect(vi.mocked(validateManifest)).toHaveBeenCalled()
      const plugins = manager.listPlugins()
      expect(plugins).toHaveLength(1)
      expect(plugins[0].dbId).toBe('db-1')
      expect(plugins[0].status).toBe('installed')
    })

    it('handles invalid manifest JSON from DB gracefully', async () => {
      mockPluginRepo.listEnabled.mockReturnValue([
        { id: 'db-2', name: 'Bad Plugin', manifest: 'not-json' }
      ])

      await manager.initialize()

      expect(manager.listPlugins()).toHaveLength(0)
    })

    it('handles failed manifest validation from DB', async () => {
      mockPluginRepo.listEnabled.mockReturnValue([
        { id: 'db-3', name: 'Invalid', manifest: '{}' }
      ])
      vi.mocked(validateManifest).mockReturnValueOnce({
        success: false,
        errors: { issues: [{ message: 'Missing id' }] } as any
      })

      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      await manager.initialize()

      expect(manager.listPlugins()).toHaveLength(0)
      errorSpy.mockRestore()
    })

    it('discovers filesystem plugins and auto-registers new ones', async () => {
      const desc = makeDescriptor()
      mockDiscover.mockResolvedValue([desc])

      await manager.initialize()

      expect(mockPluginRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Test Plugin', version: '1.0.0' })
      )
      expect(manager.listPlugins()).toHaveLength(1)
    })

    it('updates existing DB plugins with filesystem path and entry points', async () => {
      // DB already has the plugin
      mockPluginRepo.listEnabled.mockReturnValue([
        { id: 'db-1', name: 'DB Plugin', manifest: '{"id":"db-plugin","name":"DB Plugin","version":"1.0.0","description":"Desc","author":{"name":"A"}}' }
      ])
      // Filesystem also has it
      const desc = makeDescriptor({ id: 'db-plugin', path: '/plugins/db-plugin' })
      mockDiscover.mockResolvedValue([desc])

      await manager.initialize()

      // Should NOT create a duplicate
      expect(mockPluginRepo.create).not.toHaveBeenCalled()
      const plugins = manager.listPlugins()
      expect(plugins).toHaveLength(1)
      expect(plugins[0].descriptor.path).toBe('/plugins/db-plugin')
    })

    it('skips explicitly uninstalled plugins on discovery', async () => {
      const desc = makeDescriptor()
      mockDiscover.mockResolvedValue([desc])
      mockSettingsRepo.get.mockReturnValue('true')

      await manager.initialize()

      expect(mockPluginRepo.create).not.toHaveBeenCalled()
      expect(manager.listPlugins()).toHaveLength(0)
    })

    it('registers sync state for data sources', async () => {
      const desc = makeDescriptor({
        manifest: {
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          description: 'Test',
          author: { name: 'A' },
          capabilities: {
            dataSources: [
              { id: 'ds1', name: 'DS1', entryPoint: 'sync.js' },
              { id: 'ds2', name: 'DS2', entryPoint: 'sync.js' }
            ]
          }
        }
      })
      mockDiscover.mockResolvedValue([desc])

      await manager.initialize()

      expect(mockSyncRepo.create).toHaveBeenCalledTimes(2)
      expect(mockSyncRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dataSourceId: 'ds1' })
      )
      expect(mockSyncRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ dataSourceId: 'ds2' })
      )
    })
  })

  describe('install', () => {
    it('installs a plugin from source path', async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)

      const result = await manager.install('/src/my-plugin')

      expect(result.id).toBe('test-plugin')
      expect(mockPluginRepo.create).toHaveBeenCalled()
      expect(manager.getPlugin('test-plugin')).toBeDefined()
    })

    it('throws when plugin is already installed', async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)

      await manager.install('/src/my-plugin')

      await expect(manager.install('/src/my-plugin')).rejects.toThrow('already installed')
    })

    it('throws when permission validation fails', async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)
      vi.mocked(validatePermissions).mockReturnValueOnce({ valid: false, warnings: ['Bad perm'] })

      await expect(manager.install('/src/my-plugin')).rejects.toThrow('Permission validation failed')
    })

    it('clears uninstalled marker on re-install', async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)

      await manager.install('/src/my-plugin')

      expect(mockSettingsRepo.delete).toHaveBeenCalledWith('plugin:uninstalled:test-plugin')
    })
  })

  describe('uninstall', () => {
    beforeEach(async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)
      await manager.install('/src/my-plugin')
      vi.clearAllMocks()
    })

    it('removes plugin from descriptors and cleans DB', async () => {
      await manager.uninstall('test-plugin')

      expect(mockInboxRepo.deleteByPlugin).toHaveBeenCalled()
      expect(mockSyncRepo.deleteByPlugin).toHaveBeenCalled()
      expect(mockPluginRepo.delete).toHaveBeenCalled()
      expect(manager.getPlugin('test-plugin')).toBeUndefined()
    })

    it('disposes sandbox if active', async () => {
      // Create a sandbox first
      await manager.getSandbox('test-plugin')
      vi.clearAllMocks()

      await manager.uninstall('test-plugin')

      expect(mockSandboxDispose).toHaveBeenCalled()
    })

    it('marks plugin as explicitly uninstalled', async () => {
      await manager.uninstall('test-plugin')

      expect(mockSettingsRepo.set).toHaveBeenCalledWith('plugin:uninstalled:test-plugin', 'true')
    })

    it('deletes plugin files from disk', async () => {
      await manager.uninstall('test-plugin')

      expect(vi.mocked(rmSync)).toHaveBeenCalledWith(
        expect.stringContaining('test-plugin'),
        { recursive: true, force: true }
      )
    })
  })

  describe('uninstallByDbId', () => {
    it('resolves manifest ID from descriptors and delegates to uninstall', async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)
      mockPluginRepo.create.mockReturnValue({ id: 'db-xyz' })
      await manager.install('/src/my-plugin')
      vi.clearAllMocks()

      await manager.uninstallByDbId('db-xyz')

      expect(manager.getPlugin('test-plugin')).toBeUndefined()
      expect(mockSettingsRepo.set).toHaveBeenCalledWith('plugin:uninstalled:test-plugin', 'true')
    })

    it('cleans DB directly when plugin not in descriptors', async () => {
      mockPluginRepo.get.mockReturnValue({
        id: 'orphan-db-id',
        manifest: '{"id":"orphan-plugin"}'
      })

      await manager.uninstallByDbId('orphan-db-id')

      expect(mockInboxRepo.deleteByPlugin).toHaveBeenCalledWith('orphan-db-id')
      expect(mockSyncRepo.deleteByPlugin).toHaveBeenCalledWith('orphan-db-id')
      expect(mockPluginRepo.delete).toHaveBeenCalledWith('orphan-db-id')
      expect(mockSettingsRepo.set).toHaveBeenCalledWith('plugin:uninstalled:orphan-plugin', 'true')
    })
  })

  describe('enable / disable', () => {
    beforeEach(async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)
      await manager.install('/src/my-plugin')
    })

    it('enables a plugin', async () => {
      await manager.enable('test-plugin')

      expect(mockPluginRepo.update).toHaveBeenCalledWith(expect.any(String), { enabled: true })
      expect(manager.getPlugin('test-plugin')?.status).toBe('installed')
    })

    it('disables a plugin and disposes its sandbox', async () => {
      await manager.getSandbox('test-plugin')
      await manager.disable('test-plugin')

      expect(mockPluginRepo.update).toHaveBeenCalledWith(expect.any(String), { enabled: false })
      expect(manager.getPlugin('test-plugin')?.status).toBe('disabled')
      expect(mockSandboxDispose).toHaveBeenCalled()
    })

    it('throws when enabling non-existent plugin', async () => {
      await expect(manager.enable('nonexistent')).rejects.toThrow('not found')
    })

    it('throws when disabling non-existent plugin', async () => {
      await expect(manager.disable('nonexistent')).rejects.toThrow('not found')
    })
  })

  describe('getSandbox', () => {
    beforeEach(async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)
      await manager.install('/src/my-plugin')
    })

    it('lazily creates a sandbox', async () => {
      const sandbox = await manager.getSandbox('test-plugin')

      expect(createSandbox).toHaveBeenCalled()
      expect(sandbox).toBeDefined()
      expect(manager.getPlugin('test-plugin')?.status).toBe('active')
    })

    it('returns existing sandbox on subsequent calls', async () => {
      const s1 = await manager.getSandbox('test-plugin')
      const s2 = await manager.getSandbox('test-plugin')

      expect(s1).toBe(s2)
      expect(createSandbox).toHaveBeenCalledTimes(1)
    })

    it('loads all entry points into sandbox', async () => {
      await manager.getSandbox('test-plugin')

      expect(mockSandboxLoadModule).toHaveBeenCalledWith('// code')
    })

    it('throws for non-existent plugin', async () => {
      await expect(manager.getSandbox('nonexistent')).rejects.toThrow('not found')
    })

    it('throws for disabled plugin', async () => {
      await manager.disable('test-plugin')

      await expect(manager.getSandbox('test-plugin')).rejects.toThrow('is disabled')
    })

    it('sets error status when sandbox creation fails', async () => {
      vi.mocked(createSandbox).mockRejectedValueOnce(new Error('Isolate failed'))

      await expect(manager.getSandbox('test-plugin')).rejects.toThrow('Isolate failed')
      expect(manager.getPlugin('test-plugin')?.status).toBe('error')
      expect(manager.getPlugin('test-plugin')?.error).toBe('Isolate failed')
    })

    it('evicts oldest sandbox when at capacity', async () => {
      // Install 11 plugins to exceed MAX_ACTIVE_SANDBOXES (10)
      for (let i = 0; i < 11; i++) {
        const desc = makeDescriptor({
          id: `plugin-${i}`,
          manifest: {
            id: `plugin-${i}`,
            name: `Plugin ${i}`,
            version: '1.0.0',
            description: 'Test',
            author: { name: 'A' }
          }
        })
        mockLoadFromPath.mockResolvedValue(desc)
        await manager.install(`/src/plugin-${i}`)
      }

      // Create sandboxes for first 10 plugins
      for (let i = 0; i < 10; i++) {
        await manager.getSandbox(`plugin-${i}`)
      }

      vi.clearAllMocks()

      // Create sandbox for 11th plugin — should evict oldest
      await manager.getSandbox('plugin-10')

      expect(mockSandboxDispose).toHaveBeenCalled()
    })
  })

  describe('callDataSource', () => {
    beforeEach(async () => {
      const desc = makeDescriptor({
        manifest: {
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          description: 'Test',
          author: { name: 'A' },
          capabilities: {
            dataSources: [{ id: 'emails', name: 'Emails', entryPoint: 'sync.js' }]
          }
        }
      })
      mockLoadFromPath.mockResolvedValue(desc)
      await manager.install('/src/my-plugin')
    })

    it('calls method on sandbox for a valid data source', async () => {
      mockSandboxCall.mockResolvedValue([{ id: '1' }])

      const result = await manager.callDataSource('test-plugin', 'emails', 'onSync', [{ since: 0 }])

      expect(mockSandboxCall).toHaveBeenCalledWith('onSync', [{ since: 0 }])
      expect(result).toEqual([{ id: '1' }])
    })

    it('throws for non-existent data source', async () => {
      await expect(
        manager.callDataSource('test-plugin', 'nonexistent', 'onSync')
      ).rejects.toThrow('Data source "nonexistent" not found')
    })

    it('throws for non-existent plugin', async () => {
      await expect(
        manager.callDataSource('no-plugin', 'emails', 'onSync')
      ).rejects.toThrow('Plugin "no-plugin" not found')
    })
  })

  describe('callAction', () => {
    beforeEach(async () => {
      const desc = makeDescriptor({
        manifest: {
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          description: 'Test',
          author: { name: 'A' },
          capabilities: {
            actions: [{ id: 'reply', name: 'Reply', entryPoint: 'actions.js' }]
          }
        }
      })
      mockLoadFromPath.mockResolvedValue(desc)
      await manager.install('/src/my-plugin')
    })

    it('calls action_{id} on sandbox', async () => {
      mockSandboxCall.mockResolvedValue({ ok: true })

      const result = await manager.callAction('test-plugin', 'reply', [{ body: 'Hi' }])

      expect(mockSandboxCall).toHaveBeenCalledWith('action_reply', [{ body: 'Hi' }])
      expect(result).toEqual({ ok: true })
    })

    it('throws for non-existent action', async () => {
      await expect(
        manager.callAction('test-plugin', 'delete', [])
      ).rejects.toThrow('Action "delete" not found')
    })
  })

  describe('callAIPipeline', () => {
    beforeEach(async () => {
      const desc = makeDescriptor({
        manifest: {
          id: 'test-plugin',
          name: 'Test Plugin',
          version: '1.0.0',
          description: 'Test',
          author: { name: 'A' },
          capabilities: {
            aiPipelines: [{ id: 'classify', name: 'Classify', entryPoint: 'pipelines.js', trigger: 'onNewItems' as const }]
          }
        }
      })
      mockLoadFromPath.mockResolvedValue(desc)
      await manager.install('/src/my-plugin')
    })

    it('calls pipeline_{id} on sandbox', async () => {
      mockSandboxCall.mockResolvedValue({ label: 'important' })

      const result = await manager.callAIPipeline('test-plugin', 'classify', [{ text: 'Hello' }])

      expect(mockSandboxCall).toHaveBeenCalledWith('pipeline_classify', [{ text: 'Hello' }])
      expect(result).toEqual({ label: 'important' })
    })

    it('throws for non-existent pipeline', async () => {
      await expect(
        manager.callAIPipeline('test-plugin', 'summarize')
      ).rejects.toThrow('AI pipeline "summarize" not found')
    })
  })

  describe('getActivePlugins', () => {
    it('returns only non-disabled, non-error plugins', async () => {
      // Install two plugins (install() calls loadFromPath twice per install: validate + re-load)
      const desc1 = makeDescriptor({ id: 'p1', manifest: { id: 'p1', name: 'P1', version: '1.0.0', description: 'D', author: { name: 'A' } } })
      const desc2 = makeDescriptor({ id: 'p2', manifest: { id: 'p2', name: 'P2', version: '1.0.0', description: 'D', author: { name: 'A' } } })
      mockLoadFromPath
        .mockResolvedValueOnce(desc1)  // install p1: validate
        .mockResolvedValueOnce(desc1)  // install p1: re-load
        .mockResolvedValueOnce(desc2)  // install p2: validate
        .mockResolvedValueOnce(desc2)  // install p2: re-load

      await manager.install('/src/p1')
      await manager.install('/src/p2')
      await manager.disable('p2')

      const active = manager.getActivePlugins()
      expect(active).toHaveLength(1)
      expect(active[0].id).toBe('p1')
    })
  })

  describe('getMemoryUsage', () => {
    it('returns null when no sandbox exists', () => {
      expect(manager.getMemoryUsage('test-plugin')).toBeNull()
    })

    it('returns memory stats from active sandbox', async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)
      await manager.install('/src/my-plugin')
      await manager.getSandbox('test-plugin')

      const usage = manager.getMemoryUsage('test-plugin')
      expect(usage).toEqual({ used: 1024, limit: 134217728 })
    })
  })

  describe('dispose', () => {
    it('disposes all sandboxes and clears state', async () => {
      const desc = makeDescriptor()
      mockLoadFromPath.mockResolvedValue(desc)
      await manager.install('/src/my-plugin')
      await manager.getSandbox('test-plugin')

      manager.dispose()

      expect(mockSandboxDispose).toHaveBeenCalled()
      expect(manager.listPlugins()).toHaveLength(0)
    })
  })

  describe('getEventBus', () => {
    it('returns the event bus', () => {
      const bus = manager.getEventBus()
      expect(bus).toBeDefined()
      expect(typeof bus.on).toBe('function')
      expect(typeof bus.emit).toBe('function')
    })
  })
})
