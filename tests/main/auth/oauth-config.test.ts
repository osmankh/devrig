import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { getOAuthConfig } from '../../../src/main/auth/oauth-config'

describe('oauth-config', () => {
  const originalEnv = process.env

  beforeEach(() => {
    // Isolate env mutations per test
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('getOAuthConfig', () => {
    it('returns null for unknown provider', () => {
      expect(getOAuthConfig('unknown-provider')).toBeNull()
    })

    it('returns null for empty string', () => {
      expect(getOAuthConfig('')).toBeNull()
    })
  })

  describe('Gmail config', () => {
    it('returns null when DEVRIG_GOOGLE_CLIENT_ID is missing', () => {
      delete process.env['DEVRIG_GOOGLE_CLIENT_ID']
      process.env['DEVRIG_GOOGLE_CLIENT_SECRET'] = 'secret'
      expect(getOAuthConfig('gmail')).toBeNull()
    })

    it('returns null when DEVRIG_GOOGLE_CLIENT_SECRET is missing', () => {
      process.env['DEVRIG_GOOGLE_CLIENT_ID'] = 'id'
      delete process.env['DEVRIG_GOOGLE_CLIENT_SECRET']
      expect(getOAuthConfig('gmail')).toBeNull()
    })

    it('returns correct config when both env vars are set', () => {
      process.env['DEVRIG_GOOGLE_CLIENT_ID'] = 'google-client-id'
      process.env['DEVRIG_GOOGLE_CLIENT_SECRET'] = 'google-secret'

      const config = getOAuthConfig('gmail')
      expect(config).not.toBeNull()
      expect(config!.providerId).toBe('gmail')
      expect(config!.flowType).toBe('authorization_code')
      expect(config!.authUrl).toBe('https://accounts.google.com/o/oauth2/v2/auth')
      expect(config!.tokenUrl).toBe('https://oauth2.googleapis.com/token')
      expect(config!.clientId).toBe('google-client-id')
      expect(config!.clientSecret).toBe('google-secret')
      expect(config!.scopes).toContain('https://www.googleapis.com/auth/gmail.readonly')
      expect(config!.scopes).toContain('https://www.googleapis.com/auth/gmail.modify')
      expect(config!.scopes).toContain('https://www.googleapis.com/auth/gmail.send')
    })

    it('maps access_token and refresh_token', () => {
      process.env['DEVRIG_GOOGLE_CLIENT_ID'] = 'id'
      process.env['DEVRIG_GOOGLE_CLIENT_SECRET'] = 'secret'

      const config = getOAuthConfig('gmail')!
      expect(config.tokenMapping['access_token']).toBe('gmail_oauth_token')
      expect(config.tokenMapping['refresh_token']).toBe('gmail_refresh_token')
    })
  })

  describe('GitHub config', () => {
    it('returns null when DEVRIG_GITHUB_CLIENT_ID is missing', () => {
      delete process.env['DEVRIG_GITHUB_CLIENT_ID']
      expect(getOAuthConfig('github')).toBeNull()
    })

    it('returns correct config when env var is set', () => {
      process.env['DEVRIG_GITHUB_CLIENT_ID'] = 'gh-client-id'

      const config = getOAuthConfig('github')
      expect(config).not.toBeNull()
      expect(config!.providerId).toBe('github')
      expect(config!.flowType).toBe('device_code')
      expect(config!.authUrl).toBe('https://github.com/login/device/code')
      expect(config!.tokenUrl).toBe('https://github.com/login/oauth/access_token')
      expect(config!.clientId).toBe('gh-client-id')
      expect(config!.clientSecret).toBeUndefined()
      expect(config!.scopes).toEqual(['repo', 'read:user', 'notifications'])
    })

    it('maps only access_token (no refresh_token)', () => {
      process.env['DEVRIG_GITHUB_CLIENT_ID'] = 'gh-id'

      const config = getOAuthConfig('github')!
      expect(config.tokenMapping['access_token']).toBe('github_token')
      expect(config.tokenMapping['refresh_token']).toBeUndefined()
    })
  })

  describe('Linear config', () => {
    it('returns null when DEVRIG_LINEAR_CLIENT_ID is missing', () => {
      delete process.env['DEVRIG_LINEAR_CLIENT_ID']
      process.env['DEVRIG_LINEAR_CLIENT_SECRET'] = 'secret'
      expect(getOAuthConfig('linear')).toBeNull()
    })

    it('returns null when DEVRIG_LINEAR_CLIENT_SECRET is missing', () => {
      process.env['DEVRIG_LINEAR_CLIENT_ID'] = 'id'
      delete process.env['DEVRIG_LINEAR_CLIENT_SECRET']
      expect(getOAuthConfig('linear')).toBeNull()
    })

    it('returns correct config when both env vars are set', () => {
      process.env['DEVRIG_LINEAR_CLIENT_ID'] = 'linear-id'
      process.env['DEVRIG_LINEAR_CLIENT_SECRET'] = 'linear-secret'

      const config = getOAuthConfig('linear')
      expect(config).not.toBeNull()
      expect(config!.providerId).toBe('linear')
      expect(config!.flowType).toBe('authorization_code')
      expect(config!.authUrl).toBe('https://linear.app/oauth/authorize')
      expect(config!.tokenUrl).toBe('https://api.linear.app/oauth/token')
      expect(config!.clientId).toBe('linear-id')
      expect(config!.clientSecret).toBe('linear-secret')
      expect(config!.scopes).toEqual(['read', 'write', 'issues:create'])
    })

    it('maps only access_token', () => {
      process.env['DEVRIG_LINEAR_CLIENT_ID'] = 'id'
      process.env['DEVRIG_LINEAR_CLIENT_SECRET'] = 'secret'

      const config = getOAuthConfig('linear')!
      expect(config.tokenMapping['access_token']).toBe('linear_api_key')
      expect(config.tokenMapping['refresh_token']).toBeUndefined()
    })
  })
})
