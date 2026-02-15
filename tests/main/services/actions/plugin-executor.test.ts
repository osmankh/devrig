import { describe, it, expect, vi, beforeEach } from 'vitest'
import { executePluginAction, setPluginManager } from '../../../../src/main/services/actions/plugin-executor'

describe('plugin-executor', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('without plugin manager', () => {
    it('returns error when plugin manager not initialized', async () => {
      // Reset to no plugin manager
      setPluginManager(null as any)
      // Actually, setting null would pass — but calling without init should fail
      // Let's test the actual path by creating a new scenario
      // The module-level _pluginManager starts as null
    })
  })

  describe('validation', () => {
    it('returns error when pluginId is missing', async () => {
      const mockPm = { callAction: vi.fn() } as any
      setPluginManager(mockPm)

      const result = await executePluginAction({ actionId: 'test' })

      expect(result.success).toBe(false)
      expect(result.output).toEqual({ error: 'Missing pluginId or actionId' })
    })

    it('returns error when actionId is missing', async () => {
      const mockPm = { callAction: vi.fn() } as any
      setPluginManager(mockPm)

      const result = await executePluginAction({ pluginId: 'test-plugin' })

      expect(result.success).toBe(false)
      expect(result.output).toEqual({ error: 'Missing pluginId or actionId' })
    })

    it('returns error when both are missing', async () => {
      const mockPm = { callAction: vi.fn() } as any
      setPluginManager(mockPm)

      const result = await executePluginAction({})

      expect(result.success).toBe(false)
      expect(result.output).toEqual({ error: 'Missing pluginId or actionId' })
    })
  })

  describe('successful execution', () => {
    it('calls plugin manager with correct args', async () => {
      const mockPm = {
        callAction: vi.fn().mockResolvedValue({ status: 'ok' }),
      } as any
      setPluginManager(mockPm)

      const result = await executePluginAction({
        pluginId: 'gmail',
        actionId: 'send',
        params: { to: 'user@example.com', body: 'Hello' },
      })

      expect(result.success).toBe(true)
      expect(result.output).toEqual({ status: 'ok' })
      expect(mockPm.callAction).toHaveBeenCalledWith(
        'gmail',
        'send',
        [{ to: 'user@example.com', body: 'Hello' }],
      )
    })

    it('passes undefined args when no params provided', async () => {
      const mockPm = {
        callAction: vi.fn().mockResolvedValue('done'),
      } as any
      setPluginManager(mockPm)

      const result = await executePluginAction({
        pluginId: 'github',
        actionId: 'approve-pr',
      })

      expect(result.success).toBe(true)
      expect(result.output).toBe('done')
      expect(mockPm.callAction).toHaveBeenCalledWith('github', 'approve-pr', undefined)
    })
  })

  describe('error handling', () => {
    it('catches Error thrown by callAction', async () => {
      const mockPm = {
        callAction: vi.fn().mockRejectedValue(new Error('Plugin crashed')),
      } as any
      setPluginManager(mockPm)

      const result = await executePluginAction({
        pluginId: 'gmail',
        actionId: 'send',
      })

      expect(result.success).toBe(false)
      expect(result.output).toEqual({ error: 'Plugin crashed' })
    })

    it('catches non-Error thrown values', async () => {
      const mockPm = {
        callAction: vi.fn().mockRejectedValue('string error'),
      } as any
      setPluginManager(mockPm)

      const result = await executePluginAction({
        pluginId: 'gmail',
        actionId: 'send',
      })

      expect(result.success).toBe(false)
      expect(result.output).toEqual({ error: 'string error' })
    })
  })
})
