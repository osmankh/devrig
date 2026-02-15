import { describe, it, expect, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Mock ipc-security
// ---------------------------------------------------------------------------
const handlers: Record<string, Function> = {}

vi.mock('../../../src/main/ipc-security', () => ({
  secureHandle: vi.fn((channel: string, handler: Function) => {
    handlers[channel] = handler
  })
}))

import { registerOAuthHandlers } from '../../../src/main/ipc/oauth-handlers'

// ---------------------------------------------------------------------------
// Mock orchestrator
// ---------------------------------------------------------------------------
function makeMockOrchestrator() {
  return {
    supportsOAuth: vi.fn(() => true),
    startFlow: vi.fn(async () => ({ userCode: 'ABC123', verificationUri: 'https://auth.example.com' })),
    pollDeviceFlow: vi.fn(async () => ({ status: 'complete' })),
    getStatus: vi.fn(() => ({ connected: true })),
    disconnect: vi.fn(async () => {}),
    refreshToken: vi.fn(async () => ({ success: true }))
  }
}

describe('oauth-handlers', () => {
  let orchestrator: ReturnType<typeof makeMockOrchestrator>
  const evt = {} as any

  beforeEach(() => {
    vi.clearAllMocks()
    Object.keys(handlers).forEach((k) => delete handlers[k])
    orchestrator = makeMockOrchestrator()
    registerOAuthHandlers(orchestrator as any)
  })

  // -----------------------------------------------------------------------
  // oauth:supports
  // -----------------------------------------------------------------------
  describe('oauth:supports', () => {
    it('returns true when plugin supports OAuth', () => {
      orchestrator.supportsOAuth.mockReturnValue(true)
      const result = handlers['oauth:supports'](evt, 'gmail')
      expect(result).toEqual({ data: true })
      expect(orchestrator.supportsOAuth).toHaveBeenCalledWith('gmail')
    })

    it('returns false when not supported', () => {
      orchestrator.supportsOAuth.mockReturnValue(false)
      const result = handlers['oauth:supports'](evt, 'custom-plugin')
      expect(result).toEqual({ data: false })
    })

    it('rejects non-string plugin id', () => {
      const result = handlers['oauth:supports'](evt, 123)
      expect(result).toEqual({ error: 'Invalid plugin id', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // oauth:start
  // -----------------------------------------------------------------------
  describe('oauth:start', () => {
    it('starts OAuth flow', async () => {
      const result = await handlers['oauth:start'](evt, 'gmail')
      expect(result).toEqual({
        data: { userCode: 'ABC123', verificationUri: 'https://auth.example.com' }
      })
    })

    it('rejects invalid plugin id', async () => {
      const result = await handlers['oauth:start'](evt, null)
      expect(result).toEqual({ error: 'Invalid plugin id', code: 'VALIDATION' })
    })

    it('handles flow error', async () => {
      orchestrator.startFlow.mockRejectedValue(new Error('Auth server down'))
      const result = await handlers['oauth:start'](evt, 'gmail')
      expect(result).toEqual({ error: 'Auth server down', code: 'OAUTH_FAILED' })
    })
  })

  // -----------------------------------------------------------------------
  // oauth:poll
  // -----------------------------------------------------------------------
  describe('oauth:poll', () => {
    it('polls device flow', async () => {
      const result = await handlers['oauth:poll'](evt, 'gmail')
      expect(result).toEqual({ data: { status: 'complete' } })
    })

    it('rejects invalid plugin id', async () => {
      const result = await handlers['oauth:poll'](evt, undefined)
      expect(result).toEqual({ error: 'Invalid plugin id', code: 'VALIDATION' })
    })

    it('handles poll error', async () => {
      orchestrator.pollDeviceFlow.mockRejectedValue(new Error('Timeout'))
      const result = await handlers['oauth:poll'](evt, 'gmail')
      expect(result).toEqual({ error: 'Timeout', code: 'POLL_FAILED' })
    })
  })

  // -----------------------------------------------------------------------
  // oauth:status
  // -----------------------------------------------------------------------
  describe('oauth:status', () => {
    it('returns connection status', () => {
      const result = handlers['oauth:status'](evt, 'gmail')
      expect(result).toEqual({ data: { connected: true } })
    })

    it('rejects invalid plugin id', () => {
      const result = handlers['oauth:status'](evt, 42)
      expect(result).toEqual({ error: 'Invalid plugin id', code: 'VALIDATION' })
    })
  })

  // -----------------------------------------------------------------------
  // oauth:disconnect
  // -----------------------------------------------------------------------
  describe('oauth:disconnect', () => {
    it('disconnects plugin', async () => {
      const result = await handlers['oauth:disconnect'](evt, 'gmail')
      expect(result).toEqual({ data: true })
      expect(orchestrator.disconnect).toHaveBeenCalledWith('gmail')
    })

    it('rejects invalid plugin id', async () => {
      const result = await handlers['oauth:disconnect'](evt, 123)
      expect(result).toEqual({ error: 'Invalid plugin id', code: 'VALIDATION' })
    })

    it('handles disconnect error', async () => {
      orchestrator.disconnect.mockRejectedValue(new Error('Token not found'))
      const result = await handlers['oauth:disconnect'](evt, 'gmail')
      expect(result).toEqual({ error: 'Token not found', code: 'DISCONNECT_FAILED' })
    })
  })

  // -----------------------------------------------------------------------
  // oauth:refresh
  // -----------------------------------------------------------------------
  describe('oauth:refresh', () => {
    it('refreshes token', async () => {
      const result = await handlers['oauth:refresh'](evt, 'gmail')
      expect(result).toEqual({ data: { success: true } })
    })

    it('rejects invalid plugin id', async () => {
      const result = await handlers['oauth:refresh'](evt, [])
      expect(result).toEqual({ error: 'Invalid plugin id', code: 'VALIDATION' })
    })

    it('handles refresh error', async () => {
      orchestrator.refreshToken.mockRejectedValue(new Error('Expired'))
      const result = await handlers['oauth:refresh'](evt, 'gmail')
      expect(result).toEqual({ error: 'Expired', code: 'REFRESH_FAILED' })
    })
  })

  // -----------------------------------------------------------------------
  // Registration
  // -----------------------------------------------------------------------
  it('registers all expected channels', () => {
    const channels = Object.keys(handlers)
    expect(channels).toContain('oauth:supports')
    expect(channels).toContain('oauth:start')
    expect(channels).toContain('oauth:poll')
    expect(channels).toContain('oauth:status')
    expect(channels).toContain('oauth:disconnect')
    expect(channels).toContain('oauth:refresh')
  })
})
