import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock electron before importing
vi.mock('electron', () => ({
  app: { getPath: vi.fn().mockReturnValue('/mock/userData') }
}))

// Mock fs
vi.mock('fs', () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn()
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

import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { PluginLoader } from '../../../src/main/plugins/plugin-loader'
import { validatePermissions } from '../../../src/main/plugins/permissions'

const mockExistsSync = vi.mocked(existsSync)
const mockReaddirSync = vi.mocked(readdirSync)
const mockReadFileSync = vi.mocked(readFileSync)
const mockStatSync = vi.mocked(statSync)
const mockValidatePermissions = vi.mocked(validatePermissions)

function validManifestJson() {
  return JSON.stringify({
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: { name: 'Test Author' }
  })
}

function manifestWithCapabilities() {
  return JSON.stringify({
    id: 'test-plugin',
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: { name: 'Test Author' },
    capabilities: {
      dataSources: [{ id: 'ds1', name: 'DS1', entryPoint: 'sync.js' }],
      actions: [{ id: 'act1', name: 'Act1', entryPoint: 'actions.js' }]
    }
  })
}

describe('PluginLoader', () => {
  let loader: PluginLoader

  beforeEach(() => {
    vi.clearAllMocks()
    loader = new PluginLoader('/test/plugins')
  })

  describe('discover', () => {
    it('returns empty array when plugins directory does not exist', async () => {
      mockExistsSync.mockReturnValue(false)
      const result = await loader.discover()
      expect(result).toEqual([])
    })

    it('discovers valid plugins in directory', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['my-plugin'] as any)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync.mockReturnValue(validManifestJson())

      const result = await loader.discover()
      expect(result).toHaveLength(1)
      expect(result[0].id).toBe('test-plugin')
      expect(result[0].name).toBe('Test Plugin')
      expect(result[0].version).toBe('1.0.0')
    })

    it('skips non-directory entries', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['file.txt', 'valid-plugin'] as any)
      mockStatSync.mockReturnValueOnce({ isDirectory: () => false } as any)
        .mockReturnValueOnce({ isDirectory: () => true } as any)
      mockReadFileSync.mockReturnValue(validManifestJson())

      const result = await loader.discover()
      expect(result).toHaveLength(1)
    })

    it('skips plugins with missing manifest.json', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        if (String(path).endsWith('manifest.json')) return false
        return true
      })
      mockReaddirSync.mockReturnValue(['bad-plugin'] as any)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await loader.discover()
      expect(result).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping bad-plugin'))
      warnSpy.mockRestore()
    })

    it('skips plugins with invalid JSON in manifest', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['bad-json'] as any)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync.mockReturnValue('{ not valid json }}}')

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await loader.discover()
      expect(result).toHaveLength(0)
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('Skipping bad-json'))
      warnSpy.mockRestore()
    })

    it('skips plugins with invalid manifest schema', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['invalid-manifest'] as any)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      // Valid JSON but missing required fields
      mockReadFileSync.mockReturnValue(JSON.stringify({ id: '' }))

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await loader.discover()
      expect(result).toHaveLength(0)
      warnSpy.mockRestore()
    })

    it('skips plugins that fail permission validation', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['bad-perms'] as any)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync.mockReturnValue(validManifestJson())
      mockValidatePermissions.mockReturnValueOnce({ valid: false, warnings: ['Too broad'] })

      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const result = await loader.discover()
      expect(result).toHaveLength(0)
      warnSpy.mockRestore()
    })

    it('discovers multiple plugins', async () => {
      mockExistsSync.mockReturnValue(true)
      mockReaddirSync.mockReturnValue(['plugin-a', 'plugin-b'] as any)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync.mockReturnValue(validManifestJson())

      const result = await loader.discover()
      expect(result).toHaveLength(2)
    })
  })

  describe('loadFromPath', () => {
    it('loads a valid plugin from an absolute path', async () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync.mockReturnValue(validManifestJson())

      const result = await loader.loadFromPath('/some/path/my-plugin')
      expect(result.id).toBe('test-plugin')
      expect(result.path).toContain('my-plugin')
    })

    it('throws when path does not exist', async () => {
      mockExistsSync.mockReturnValue(false)

      await expect(loader.loadFromPath('/nonexistent/path')).rejects.toThrow(
        'Plugin path does not exist or is not a directory'
      )
    })

    it('throws when path is not a directory', async () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ isDirectory: () => false } as any)

      await expect(loader.loadFromPath('/some/file.txt')).rejects.toThrow(
        'Plugin path does not exist or is not a directory'
      )
    })
  })

  describe('entry point collection', () => {
    it('collects entry points from capabilities', async () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      // First call: manifest, subsequent calls: entry point files
      mockReadFileSync
        .mockReturnValueOnce(manifestWithCapabilities())
        .mockReturnValueOnce('// sync.js code')
        .mockReturnValueOnce('// actions.js code')

      const result = await loader.loadFromPath('/plugins/test-plugin')
      expect(result.entryPoints.size).toBe(2)
      expect(result.entryPoints.get('sync.js')).toBe('// sync.js code')
      expect(result.entryPoints.get('actions.js')).toBe('// actions.js code')
    })

    it('skips entry points whose files do not exist', async () => {
      mockExistsSync.mockImplementation((path: any) => {
        const p = String(path)
        if (p.endsWith('actions.js')) return false
        return true
      })
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync
        .mockReturnValueOnce(manifestWithCapabilities())
        .mockReturnValueOnce('// sync.js code')

      const result = await loader.loadFromPath('/plugins/test-plugin')
      expect(result.entryPoints.size).toBe(1)
      expect(result.entryPoints.has('sync.js')).toBe(true)
      expect(result.entryPoints.has('actions.js')).toBe(false)
    })

    it('returns empty map for plugin without capabilities', async () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync.mockReturnValue(validManifestJson())

      const result = await loader.loadFromPath('/plugins/test-plugin')
      expect(result.entryPoints.size).toBe(0)
    })

    it('deduplicates shared entry points across capability types', async () => {
      const manifest = JSON.stringify({
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'A' },
        capabilities: {
          dataSources: [{ id: 'ds1', name: 'DS1', entryPoint: 'shared.js' }],
          actions: [{ id: 'act1', name: 'Act1', entryPoint: 'shared.js' }]
        }
      })
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync
        .mockReturnValueOnce(manifest)
        .mockReturnValueOnce('// shared code')

      const result = await loader.loadFromPath('/plugins/test-plugin')
      // shared.js should only be loaded once
      expect(result.entryPoints.size).toBe(1)
    })
  })

  describe('path traversal protection', () => {
    it('rejects entry points that resolve outside plugin directory', async () => {
      // The resolve + startsWith check should catch traversal
      const manifest = JSON.stringify({
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'Test',
        author: { name: 'A' },
        capabilities: {
          dataSources: [{ id: 'ds1', name: 'DS1', entryPoint: '../../etc/passwd' }]
        }
      })
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync.mockReturnValueOnce(manifest)

      const result = await loader.loadFromPath('/plugins/test-plugin')
      // The traversal entry point should be skipped
      expect(result.entryPoints.size).toBe(0)
    })
  })

  describe('default plugins directory', () => {
    it('uses userData/plugins when no custom dir provided', async () => {
      const defaultLoader = new PluginLoader()
      mockExistsSync.mockReturnValue(false)

      await defaultLoader.discover()

      // Should check /mock/userData/plugins (from mocked app.getPath)
      expect(mockExistsSync).toHaveBeenCalledWith('/mock/userData/plugins')
    })
  })

  describe('descriptor shape', () => {
    it('returns complete PluginDescriptor with all fields', async () => {
      mockExistsSync.mockReturnValue(true)
      mockStatSync.mockReturnValue({ isDirectory: () => true } as any)
      mockReadFileSync.mockReturnValue(validManifestJson())

      const result = await loader.loadFromPath('/plugins/my-plugin')
      expect(result).toMatchObject({
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        manifest: expect.objectContaining({ id: 'test-plugin' }),
        permissions: expect.objectContaining({ network: [], secrets: [] })
      })
      expect(result.path).toBeDefined()
      expect(result.entryPoints).toBeInstanceOf(Map)
    })
  })
})
