import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// Hoist mocks before any imports
const { mockShell, mockStartLoopbackServer, mockGenerateCodeVerifier, mockGenerateCodeChallenge } =
  vi.hoisted(() => ({
    mockShell: { openExternal: vi.fn().mockResolvedValue(undefined) },
    mockStartLoopbackServer: vi.fn(),
    mockGenerateCodeVerifier: vi.fn().mockReturnValue('test-verifier'),
    mockGenerateCodeChallenge: vi.fn().mockReturnValue('test-challenge')
  }))

vi.mock('electron', () => ({
  shell: mockShell
}))

vi.mock('../../../src/main/auth/loopback-server', () => ({
  startLoopbackServer: mockStartLoopbackServer
}))

vi.mock('../../../src/main/auth/pkce', () => ({
  generateCodeVerifier: mockGenerateCodeVerifier,
  generateCodeChallenge: mockGenerateCodeChallenge
}))

import { OAuthOrchestrator } from '../../../src/main/auth/oauth-orchestrator'

function makeSecretsBridge() {
  const store = new Map<string, string>()
  return {
    hasPluginSecret: vi.fn((pluginId: string, key: string) =>
      store.has(`${pluginId}:${key}`)
    ),
    getPluginSecret: vi.fn((pluginId: string, key: string) =>
      store.get(`${pluginId}:${key}`) ?? null
    ),
    setPluginSecret: vi.fn((pluginId: string, key: string, value: string) => {
      store.set(`${pluginId}:${key}`, value)
    }),
    removePluginSecret: vi.fn((pluginId: string, key: string) => {
      store.delete(`${pluginId}:${key}`)
    }),
    _store: store
  }
}

describe('OAuthOrchestrator', () => {
  let secrets: ReturnType<typeof makeSecretsBridge>
  let orchestrator: OAuthOrchestrator
  const originalEnv = process.env

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      DEVRIG_GOOGLE_CLIENT_ID: 'google-id',
      DEVRIG_GOOGLE_CLIENT_SECRET: 'google-secret',
      DEVRIG_GITHUB_CLIENT_ID: 'github-id',
      DEVRIG_LINEAR_CLIENT_ID: 'linear-id',
      DEVRIG_LINEAR_CLIENT_SECRET: 'linear-secret'
    }
    secrets = makeSecretsBridge()
    orchestrator = new OAuthOrchestrator(secrets as any)
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('supportsOAuth', () => {
    it('returns true for gmail', () => {
      expect(orchestrator.supportsOAuth('gmail')).toBe(true)
    })

    it('returns true for github', () => {
      expect(orchestrator.supportsOAuth('github')).toBe(true)
    })

    it('returns true for linear', () => {
      expect(orchestrator.supportsOAuth('linear')).toBe(true)
    })

    it('returns false for unknown provider', () => {
      expect(orchestrator.supportsOAuth('slack')).toBe(false)
    })

    it('returns false when env vars are missing', () => {
      delete process.env['DEVRIG_GOOGLE_CLIENT_ID']
      delete process.env['DEVRIG_GOOGLE_CLIENT_SECRET']
      expect(orchestrator.supportsOAuth('gmail')).toBe(false)
    })
  })

  describe('startFlow — authorization_code (Gmail)', () => {
    it('opens the browser with correct auth URL', async () => {
      const mockClose = vi.fn()
      const mockWaitForCallback = vi.fn().mockReturnValue(new Promise(() => {})) // never resolves
      mockStartLoopbackServer.mockResolvedValue({
        port: 54321,
        waitForCallback: mockWaitForCallback,
        close: mockClose
      })

      const result = await orchestrator.startFlow('gmail')

      expect(result.type).toBe('browser_opened')
      expect(mockStartLoopbackServer).toHaveBeenCalled()
      expect(mockShell.openExternal).toHaveBeenCalledWith(
        expect.stringContaining('https://accounts.google.com/o/oauth2/v2/auth')
      )

      // Verify URL params
      const url = new URL(mockShell.openExternal.mock.calls[0][0])
      expect(url.searchParams.get('response_type')).toBe('code')
      expect(url.searchParams.get('client_id')).toBe('google-id')
      expect(url.searchParams.get('redirect_uri')).toBe('http://127.0.0.1:54321')
      expect(url.searchParams.get('code_challenge')).toBe('test-challenge')
      expect(url.searchParams.get('code_challenge_method')).toBe('S256')
      // Gmail-specific params
      expect(url.searchParams.get('access_type')).toBe('offline')
      expect(url.searchParams.get('prompt')).toBe('consent')
    })

    it('throws for unknown provider', async () => {
      await expect(orchestrator.startFlow('slack')).rejects.toThrow(
        'No OAuth config for provider: slack'
      )
    })
  })

  describe('startFlow — device_code (GitHub)', () => {
    it('requests a device code and returns user_code', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          device_code: 'dev-code-123',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5
        })
      })
      vi.stubGlobal('fetch', mockFetch)

      const result = await orchestrator.startFlow('github')

      expect(result.type).toBe('device_code')
      expect(result.userCode).toBe('ABCD-1234')
      expect(result.verificationUri).toBe('https://github.com/login/device')
      expect(mockFetch).toHaveBeenCalledWith(
        'https://github.com/login/device/code',
        expect.objectContaining({ method: 'POST' })
      )

      vi.unstubAllGlobals()
    })

    it('throws on non-ok response', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500 }))

      await expect(orchestrator.startFlow('github')).rejects.toThrow(
        'Device code request failed: 500'
      )

      vi.unstubAllGlobals()
    })
  })

  describe('pollDeviceFlow', () => {
    async function setupDeviceFlow() {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          device_code: 'dev-code',
          user_code: 'CODE',
          verification_uri: 'https://example.com',
          expires_in: 900,
          interval: 5
        })
      })
      vi.stubGlobal('fetch', mockFetch)
      await orchestrator.startFlow('github')
      return mockFetch
    }

    afterEach(() => {
      vi.unstubAllGlobals()
    })

    it('throws when no pending device flow exists', async () => {
      await expect(orchestrator.pollDeviceFlow('github')).rejects.toThrow(
        'No pending device flow for provider: github'
      )
    })

    it('returns pending when authorization_pending', async () => {
      const mockFetch = await setupDeviceFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ error: 'authorization_pending' })
      })

      const result = await orchestrator.pollDeviceFlow('github')
      expect(result.status).toBe('pending')
    })

    it('returns pending on slow_down (increases interval)', async () => {
      const mockFetch = await setupDeviceFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ error: 'slow_down' })
      })

      const result = await orchestrator.pollDeviceFlow('github')
      expect(result.status).toBe('pending')
    })

    it('returns expired when token has expired', async () => {
      const mockFetch = await setupDeviceFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ error: 'expired_token' })
      })

      const result = await orchestrator.pollDeviceFlow('github')
      expect(result.status).toBe('expired')
    })

    it('returns denied on access_denied', async () => {
      const mockFetch = await setupDeviceFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ error: 'access_denied' })
      })

      const result = await orchestrator.pollDeviceFlow('github')
      expect(result.status).toBe('denied')
    })

    it('throws on unknown error', async () => {
      const mockFetch = await setupDeviceFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({ error: 'server_error' })
      })

      await expect(orchestrator.pollDeviceFlow('github')).rejects.toThrow(
        'Device flow error: server_error'
      )
    })

    it('returns complete and stores tokens on success', async () => {
      const mockFetch = await setupDeviceFlow()
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'ghp_token123',
          token_type: 'bearer'
        })
      })

      const result = await orchestrator.pollDeviceFlow('github')
      expect(result.status).toBe('complete')
      expect(secrets.setPluginSecret).toHaveBeenCalledWith('github', 'github_token', 'ghp_token123')
    })

    it('returns expired when flow has timed out locally', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          device_code: 'dev-code',
          user_code: 'CODE',
          verification_uri: 'https://example.com',
          expires_in: 0, // expires immediately
          interval: 5
        })
      })
      vi.stubGlobal('fetch', mockFetch)
      await orchestrator.startFlow('github')

      // Wait a tick so Date.now() advances past expiresAt
      await new Promise((r) => setTimeout(r, 10))

      const result = await orchestrator.pollDeviceFlow('github')
      expect(result.status).toBe('expired')
    })
  })

  describe('getStatus', () => {
    it('returns connected: false for unknown provider', () => {
      expect(orchestrator.getStatus('slack')).toEqual({ connected: false })
    })

    it('returns connected: false when no token stored', () => {
      expect(orchestrator.getStatus('gmail')).toEqual({ connected: false })
    })

    it('returns connected: true when primary token exists', () => {
      secrets._store.set('gmail:gmail_oauth_token', 'token-value')

      const status = orchestrator.getStatus('gmail')
      expect(status.connected).toBe(true)
    })

    it('includes expiresAt from token metadata', () => {
      secrets._store.set('gmail:gmail_oauth_token', 'token-value')
      secrets._store.set(
        'gmail:gmail:oauth_token_metadata',
        JSON.stringify({ expiresAt: 1700000000000 })
      )

      const status = orchestrator.getStatus('gmail')
      expect(status.connected).toBe(true)
      expect(status.expiresAt).toBe(1700000000000)
    })

    it('ignores invalid metadata JSON', () => {
      secrets._store.set('gmail:gmail_oauth_token', 'token-value')
      secrets._store.set('gmail:gmail:oauth_token_metadata', 'not-json')

      const status = orchestrator.getStatus('gmail')
      expect(status.connected).toBe(true)
      expect(status.expiresAt).toBeUndefined()
    })
  })

  describe('disconnect', () => {
    it('removes all tokens for the provider', async () => {
      secrets._store.set('gmail:gmail_oauth_token', 'token')
      secrets._store.set('gmail:gmail_refresh_token', 'refresh')

      await orchestrator.disconnect('gmail')

      expect(secrets.removePluginSecret).toHaveBeenCalledWith('gmail', 'gmail_oauth_token')
      expect(secrets.removePluginSecret).toHaveBeenCalledWith('gmail', 'gmail_refresh_token')
      expect(secrets.removePluginSecret).toHaveBeenCalledWith('gmail', 'gmail:oauth_token_metadata')
    })

    it('is a no-op for unknown provider', async () => {
      await expect(orchestrator.disconnect('slack')).resolves.toBeUndefined()
    })

    it('cleans up pending device flows', async () => {
      // Start a device flow first
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            device_code: 'dc',
            user_code: 'UC',
            verification_uri: 'https://example.com',
            expires_in: 900,
            interval: 5
          })
        })
      )
      await orchestrator.startFlow('github')
      vi.unstubAllGlobals()

      await orchestrator.disconnect('github')

      // pollDeviceFlow should now throw — pending flow was cleared
      await expect(orchestrator.pollDeviceFlow('github')).rejects.toThrow(
        'No pending device flow'
      )
    })
  })

  describe('refreshToken', () => {
    it('returns false for unknown provider', async () => {
      expect(await orchestrator.refreshToken('slack')).toBe(false)
    })

    it('returns false when no refresh_token mapping exists (github)', async () => {
      expect(await orchestrator.refreshToken('github')).toBe(false)
    })

    it('returns false when refresh_token is not stored', async () => {
      // Gmail has refresh_token mapping but no stored token
      expect(await orchestrator.refreshToken('gmail')).toBe(false)
    })

    it('refreshes token and stores new tokens on success', async () => {
      secrets._store.set('gmail:gmail_refresh_token', 'old-refresh-token')

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: vi.fn().mockResolvedValue({
            access_token: 'new-access',
            refresh_token: 'new-refresh',
            expires_in: 3600,
            token_type: 'Bearer'
          })
        })
      )

      const result = await orchestrator.refreshToken('gmail')
      expect(result).toBe(true)
      expect(secrets.setPluginSecret).toHaveBeenCalledWith('gmail', 'gmail_oauth_token', 'new-access')
      expect(secrets.setPluginSecret).toHaveBeenCalledWith('gmail', 'gmail_refresh_token', 'new-refresh')

      vi.unstubAllGlobals()
    })

    it('returns false on HTTP error', async () => {
      secrets._store.set('gmail:gmail_refresh_token', 'refresh-token')

      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({ ok: false, status: 401 })
      )

      expect(await orchestrator.refreshToken('gmail')).toBe(false)

      vi.unstubAllGlobals()
    })

    it('returns false on network error', async () => {
      secrets._store.set('gmail:gmail_refresh_token', 'refresh-token')

      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))

      expect(await orchestrator.refreshToken('gmail')).toBe(false)

      vi.unstubAllGlobals()
    })

    it('includes client_secret in refresh request when available', async () => {
      secrets._store.set('gmail:gmail_refresh_token', 'refresh-token')

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          access_token: 'new-token',
          token_type: 'Bearer'
        })
      })
      vi.stubGlobal('fetch', mockFetch)

      await orchestrator.refreshToken('gmail')

      const body = mockFetch.mock.calls[0][1].body as string
      expect(body).toContain('client_secret=google-secret')

      vi.unstubAllGlobals()
    })
  })
})
