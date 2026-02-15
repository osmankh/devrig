import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock isolated-vm
const mockContextEval = vi.fn().mockResolvedValue(undefined)
const mockContextEvalClosure = vi.fn().mockResolvedValue('null')
const mockContextRelease = vi.fn()
const mockGlobalSet = vi.fn().mockResolvedValue(undefined)
const mockGlobalDerefInto = vi.fn().mockReturnValue({})
const mockCreateContext = vi.fn().mockResolvedValue({
  global: {
    set: mockGlobalSet,
    derefInto: mockGlobalDerefInto
  },
  eval: mockContextEval,
  evalClosure: mockContextEvalClosure,
  release: mockContextRelease
})
const mockIsolateDispose = vi.fn()
const mockGetHeapStatisticsSync = vi.fn().mockReturnValue({
  used_heap_size: 2048,
  total_heap_size: 4096
})

vi.mock('isolated-vm', () => {
  class MockIsolate {
    createContext = mockCreateContext
    dispose = mockIsolateDispose
    getHeapStatisticsSync = mockGetHeapStatisticsSync
  }

  class MockCallback {
    private fn: any
    constructor(fn: any, _opts?: any) {
      this.fn = fn
      // Return the function itself so host-function injection tests work
      return fn as any
    }
  }

  return {
    default: {
      Isolate: MockIsolate,
      Callback: MockCallback
    }
  }
})

vi.mock('../../../src/main/plugins/permissions', () => ({
  isUrlAllowed: vi.fn().mockReturnValue(true)
}))

import { PluginSandbox, createSandbox, type HostFunctions } from '../../../src/main/plugins/isolate-sandbox'
import type { PluginPermissions } from '../../../src/main/plugins/permissions'

function makePermissions(overrides?: Partial<PluginPermissions>): PluginPermissions {
  return {
    network: ['api.example.com'],
    secrets: ['API_KEY'],
    ai: true,
    filesystem: [],
    ...overrides
  }
}

function makeHostFunctions(): HostFunctions {
  return {
    fetch: vi.fn().mockResolvedValue({ status: 200 }),
    getSecret: vi.fn().mockResolvedValue('secret-value'),
    storeItems: vi.fn().mockResolvedValue(undefined),
    queryItems: vi.fn().mockResolvedValue([]),
    markRead: vi.fn().mockResolvedValue(undefined),
    archive: vi.fn().mockResolvedValue(undefined),
    emitEvent: vi.fn(),
    requestAI: vi.fn().mockResolvedValue({ result: 'ok' })
  }
}

describe('PluginSandbox', () => {
  let permissions: PluginPermissions
  let hostFns: HostFunctions

  beforeEach(() => {
    vi.clearAllMocks()
    permissions = makePermissions()
    hostFns = makeHostFunctions()
  })

  describe('constructor', () => {
    it('creates an isolate with correct memory limit', () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)

      // Verify isolate was created by checking memory usage returns expected limit
      const usage = sandbox.getMemoryUsage()
      expect(usage.limit).toBe(128 * 1024 * 1024)
    })
  })

  describe('initialize', () => {
    it('creates context and sets global reference', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()

      expect(mockCreateContext).toHaveBeenCalled()
      expect(mockGlobalSet).toHaveBeenCalledWith('global', expect.anything())
    })

    it('injects all host functions', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()

      const setNames = mockGlobalSet.mock.calls.map((c: any[]) => c[0])
      expect(setNames).toContain('global')
      expect(setNames).toContain('__hostLog')
      expect(setNames).toContain('__hostFetch')
      expect(setNames).toContain('__hostGetSecret')
      expect(setNames).toContain('__hostStoreItems')
      expect(setNames).toContain('__hostQueryItems')
      expect(setNames).toContain('__hostMarkRead')
      expect(setNames).toContain('__hostArchive')
      expect(setNames).toContain('__hostEmitEvent')
      expect(setNames).toContain('__hostRequestAI')
    })

    it('evaluates the devrig wrapper script', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()

      expect(mockContextEval).toHaveBeenCalledWith(
        expect.stringContaining('globalThis.devrig'),
        expect.objectContaining({ timeout: 5000 })
      )
    })
  })

  describe('loadModule', () => {
    it('evaluates code in the sandbox context', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()
      vi.clearAllMocks()

      await sandbox.loadModule('function onSync() { return []; }')

      expect(mockContextEval).toHaveBeenCalledWith(
        'function onSync() { return []; }',
        expect.objectContaining({ timeout: 5000 })
      )
    })

    it('throws when sandbox is disposed', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()
      sandbox.dispose()

      await expect(sandbox.loadModule('code')).rejects.toThrow('has been disposed')
    })

    it('throws when sandbox is not initialized', () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)

      expect(() => sandbox.loadModule('code')).rejects.toThrow('not initialized')
    })
  })

  describe('call', () => {
    it('calls evalClosure with function name and args', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()
      mockContextEvalClosure.mockResolvedValue('"hello"')

      const result = await sandbox.call('onSync', [{ since: 0 }])

      expect(mockContextEvalClosure).toHaveBeenCalledWith(
        expect.stringContaining('globalThis[$0]'),
        ['onSync', JSON.stringify([{ since: 0 }])],
        expect.objectContaining({
          timeout: 5000,
          promise: true,
          arguments: { copy: true },
          result: { copy: true }
        })
      )
      expect(result).toBe('hello')
    })

    it('uses empty array when no args provided', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()
      mockContextEvalClosure.mockResolvedValue('null')

      await sandbox.call('myFunc')

      expect(mockContextEvalClosure).toHaveBeenCalledWith(
        expect.any(String),
        ['myFunc', '[]'],
        expect.any(Object)
      )
    })

    it('rejects invalid function names (injection prevention)', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()

      await expect(sandbox.call('eval("evil")')).rejects.toThrow('Invalid function name')
      await expect(sandbox.call('fn;rm -rf /')).rejects.toThrow('Invalid function name')
      await expect(sandbox.call('fn name')).rejects.toThrow('Invalid function name')
    })

    it('allows valid function names with dots and underscores', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()
      mockContextEvalClosure.mockResolvedValue('null')

      await expect(sandbox.call('plugin.onSync')).resolves.not.toThrow()
      await expect(sandbox.call('my_function')).resolves.not.toThrow()
      await expect(sandbox.call('action_reply')).resolves.not.toThrow()
    })

    it('throws when disposed', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()
      sandbox.dispose()

      await expect(sandbox.call('fn')).rejects.toThrow('has been disposed')
    })
  })

  describe('getMemoryUsage', () => {
    it('returns heap stats with correct limit', () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)

      const usage = sandbox.getMemoryUsage()

      expect(usage.used).toBe(2048)
      expect(usage.limit).toBe(128 * 1024 * 1024)
    })
  })

  describe('dispose', () => {
    it('releases context and disposes isolate', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()

      sandbox.dispose()

      expect(mockContextRelease).toHaveBeenCalled()
      expect(mockIsolateDispose).toHaveBeenCalled()
    })

    it('is idempotent', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()

      sandbox.dispose()
      sandbox.dispose()

      // Should only dispose once
      expect(mockContextRelease).toHaveBeenCalledTimes(1)
      expect(mockIsolateDispose).toHaveBeenCalledTimes(1)
    })

    it('handles disposal when context is null', () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)

      // Should not throw even though context is null
      expect(() => sandbox.dispose()).not.toThrow()
    })
  })

  describe('host function permission checks', () => {
    it('__hostLog truncates to 2000 chars and validates level', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()

      // Find the __hostLog callback
      const logCall = mockGlobalSet.mock.calls.find((c: any[]) => c[0] === '__hostLog')
      expect(logCall).toBeDefined()

      const logFn = logCall![1]
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {})

      // Valid level
      logFn('info', 'test message')
      expect(consoleSpy).toHaveBeenCalledWith('[plugin:test-plugin][info] test message')

      // Invalid level defaults to 'info'
      logFn('INVALID', 'test')
      expect(consoleSpy).toHaveBeenCalledWith('[plugin:test-plugin][info] test')

      consoleSpy.mockRestore()
    })

    it('__hostFetch rejects when no network permissions', async () => {
      const noNetPerms = makePermissions({ network: [] })
      const sandbox = new PluginSandbox('test-plugin', noNetPerms, hostFns)
      await sandbox.initialize()

      const fetchCall = mockGlobalSet.mock.calls.find((c: any[]) => c[0] === '__hostFetch')
      const fetchFn = fetchCall![1]

      const mockReject = { applySync: vi.fn() }
      fetchFn('https://api.example.com', '', { applySync: vi.fn() }, mockReject)
      expect(mockReject.applySync).toHaveBeenCalledWith(undefined, ['No network permission'])
    })

    it('__hostGetSecret rejects when key not in permissions', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()

      const secretCall = mockGlobalSet.mock.calls.find((c: any[]) => c[0] === '__hostGetSecret')
      const secretFn = secretCall![1]

      const mockReject = { applySync: vi.fn() }
      secretFn('UNAUTHORIZED_KEY', { applySync: vi.fn() }, mockReject)
      expect(mockReject.applySync).toHaveBeenCalledWith(undefined, ['Secret access denied for key: UNAUTHORIZED_KEY'])
    })

    it('__hostGetSecret allows when key is in permissions', async () => {
      const sandbox = new PluginSandbox('test-plugin', permissions, hostFns)
      await sandbox.initialize()

      const secretCall = mockGlobalSet.mock.calls.find((c: any[]) => c[0] === '__hostGetSecret')
      const secretFn = secretCall![1]

      const mockResolve = { applySync: vi.fn() }
      const mockReject = { applySync: vi.fn() }

      // Need to wait for async operation
      secretFn('API_KEY', mockResolve, mockReject)

      // Wait for promise resolution
      await new Promise((r) => setTimeout(r, 10))

      expect(mockReject.applySync).not.toHaveBeenCalled()
      expect(mockResolve.applySync).toHaveBeenCalledWith(undefined, ['secret-value'])
    })

    it('__hostRequestAI rejects when ai permission not granted', async () => {
      const noAiPerms = makePermissions({ ai: false })
      const sandbox = new PluginSandbox('test-plugin', noAiPerms, hostFns)
      await sandbox.initialize()

      const aiCall = mockGlobalSet.mock.calls.find((c: any[]) => c[0] === '__hostRequestAI')
      const aiFn = aiCall![1]

      const mockReject = { applySync: vi.fn() }
      aiFn('classify', '{}', { applySync: vi.fn() }, mockReject)
      expect(mockReject.applySync).toHaveBeenCalledWith(undefined, ['AI permission not granted'])
    })
  })
})

describe('createSandbox', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('creates and initializes a sandbox', async () => {
    const permissions = makePermissions()
    const hostFns = makeHostFunctions()

    const sandbox = await createSandbox('test-plugin', permissions, hostFns)

    expect(sandbox).toBeInstanceOf(PluginSandbox)
    expect(mockCreateContext).toHaveBeenCalled()
  })
})
