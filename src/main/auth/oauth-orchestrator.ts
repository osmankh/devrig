import { shell } from 'electron'
import { randomBytes } from 'crypto'
import type { SecretsBridge } from '../ai/secrets-bridge'
import type {
  OAuthStartResult,
  OAuthPollResult,
  OAuthStatusResult,
  OAuthTokens,
  DeviceCodeResponse
} from './oauth-types'
import { getOAuthConfig } from './oauth-config'
import { generateCodeVerifier, generateCodeChallenge } from './pkce'
import { startLoopbackServer } from './loopback-server'

interface PendingDeviceFlow {
  deviceCode: string
  interval: number
  expiresAt: number
}

export class OAuthOrchestrator {
  private pendingDeviceFlows = new Map<string, PendingDeviceFlow>()

  constructor(private secretsBridge: SecretsBridge) {}

  supportsOAuth(providerId: string): boolean {
    return getOAuthConfig(providerId) !== null
  }

  async startFlow(providerId: string): Promise<OAuthStartResult> {
    const config = getOAuthConfig(providerId)
    if (!config) {
      throw new Error(`No OAuth config for provider: ${providerId}`)
    }

    if (config.flowType === 'authorization_code') {
      return this.startAuthCodeFlow(providerId)
    }
    return this.startDeviceCodeFlow(providerId)
  }

  async pollDeviceFlow(providerId: string): Promise<OAuthPollResult> {
    const pending = this.pendingDeviceFlows.get(providerId)
    if (!pending) {
      throw new Error(`No pending device flow for provider: ${providerId}`)
    }

    if (Date.now() > pending.expiresAt) {
      this.pendingDeviceFlows.delete(providerId)
      return { status: 'expired' }
    }

    const config = getOAuthConfig(providerId)!

    const body = JSON.stringify({
      client_id: config.clientId,
      device_code: pending.deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
    })

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body
    })

    const data = await response.json()

    if (data.error) {
      switch (data.error) {
        case 'authorization_pending':
          return { status: 'pending' }
        case 'slow_down':
          pending.interval = Math.max(pending.interval + 5, pending.interval)
          return { status: 'pending' }
        case 'expired_token':
          this.pendingDeviceFlows.delete(providerId)
          return { status: 'expired' }
        case 'access_denied':
          this.pendingDeviceFlows.delete(providerId)
          return { status: 'denied' }
        default:
          throw new Error(`Device flow error: ${data.error}`)
      }
    }

    // Success — store tokens
    this.pendingDeviceFlows.delete(providerId)
    await this.storeTokens(providerId, data as OAuthTokens)
    return { status: 'complete' }
  }

  getStatus(providerId: string): OAuthStatusResult {
    const config = getOAuthConfig(providerId)
    if (!config) return { connected: false }

    // Check if the primary token exists
    const primaryKey = Object.values(config.tokenMapping)[0]
    if (!primaryKey) return { connected: false }

    const hasToken = this.secretsBridge.hasPluginSecret(providerId, primaryKey)
    if (!hasToken) return { connected: false }

    // Check expiry metadata
    const metadataJson = this.secretsBridge.getPluginSecret(
      providerId,
      `${providerId}:oauth_token_metadata`
    )
    let expiresAt: number | undefined
    if (metadataJson) {
      try {
        const metadata = JSON.parse(metadataJson)
        expiresAt = metadata.expiresAt
      } catch { /* ignore */ }
    }

    return { connected: true, expiresAt }
  }

  async disconnect(providerId: string): Promise<void> {
    const config = getOAuthConfig(providerId)
    if (!config) return

    // Remove all tokens defined in tokenMapping
    for (const secretKey of Object.values(config.tokenMapping)) {
      this.secretsBridge.removePluginSecret(providerId, secretKey)
    }
    // Remove metadata
    this.secretsBridge.removePluginSecret(providerId, `${providerId}:oauth_token_metadata`)
    this.pendingDeviceFlows.delete(providerId)
  }

  async refreshToken(providerId: string): Promise<boolean> {
    const config = getOAuthConfig(providerId)
    if (!config) return false

    const refreshKey = config.tokenMapping['refresh_token']
    if (!refreshKey) return false

    const refreshToken = this.secretsBridge.getPluginSecret(providerId, refreshKey)
    if (!refreshToken) return false

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
      client_id: config.clientId
    })
    if (config.clientSecret) {
      params.set('client_secret', config.clientSecret)
    }

    try {
      const response = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString()
      })

      if (!response.ok) return false

      const tokens = (await response.json()) as OAuthTokens
      await this.storeTokens(providerId, tokens)
      return true
    } catch {
      return false
    }
  }

  // ---------------------------------------------------------------------------
  // Private
  // ---------------------------------------------------------------------------

  private async startAuthCodeFlow(providerId: string): Promise<OAuthStartResult> {
    const config = getOAuthConfig(providerId)!

    // PKCE
    const codeVerifier = generateCodeVerifier()
    const codeChallenge = generateCodeChallenge(codeVerifier)

    // Loopback server
    const { port, waitForCallback, close } = await startLoopbackServer()
    const redirectUri = `http://127.0.0.1:${port}`

    // State
    const state = randomBytes(16).toString('hex')

    // Build auth URL
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: config.clientId,
      redirect_uri: redirectUri,
      scope: config.scopes.join(' '),
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256'
    })

    // Google requires access_type=offline for refresh tokens
    if (providerId === 'gmail') {
      params.set('access_type', 'offline')
      params.set('prompt', 'consent')
    }

    const authUrl = `${config.authUrl}?${params.toString()}`

    // Open system browser
    await shell.openExternal(authUrl)

    // Wait for callback (async, non-blocking for caller)
    waitForCallback()
      .then(async (result) => {
        if (result.state !== state) {
          throw new Error('OAuth state mismatch')
        }
        await this.exchangeCode(providerId, result.code, redirectUri, codeVerifier)
      })
      .catch((err) => {
        console.error(`[oauth] Auth code flow failed for ${providerId}:`, err)
      })
      .finally(() => {
        close()
      })

    return { type: 'browser_opened' }
  }

  private async startDeviceCodeFlow(providerId: string): Promise<OAuthStartResult> {
    const config = getOAuthConfig(providerId)!

    const response = await fetch(config.authUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json'
      },
      body: JSON.stringify({
        client_id: config.clientId,
        scope: config.scopes.join(' ')
      })
    })

    if (!response.ok) {
      throw new Error(`Device code request failed: ${response.status}`)
    }

    const data = (await response.json()) as DeviceCodeResponse

    this.pendingDeviceFlows.set(providerId, {
      deviceCode: data.device_code,
      interval: data.interval,
      expiresAt: Date.now() + data.expires_in * 1000
    })

    return {
      type: 'device_code',
      userCode: data.user_code,
      verificationUri: data.verification_uri
    }
  }

  private async exchangeCode(
    providerId: string,
    code: string,
    redirectUri: string,
    codeVerifier: string
  ): Promise<void> {
    const config = getOAuthConfig(providerId)!

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier,
      client_id: config.clientId
    })
    if (config.clientSecret) {
      params.set('client_secret', config.clientSecret)
    }

    const response = await fetch(config.tokenUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString()
    })

    if (!response.ok) {
      const text = await response.text()
      throw new Error(`Token exchange failed (${response.status}): ${text}`)
    }

    const tokens = (await response.json()) as OAuthTokens
    await this.storeTokens(providerId, tokens)
  }

  private async storeTokens(providerId: string, tokens: OAuthTokens): Promise<void> {
    const config = getOAuthConfig(providerId)
    if (!config) return

    for (const [tokenField, secretKey] of Object.entries(config.tokenMapping)) {
      const value = tokens[tokenField as keyof OAuthTokens]
      if (typeof value === 'string') {
        this.secretsBridge.setPluginSecret(providerId, secretKey, value)
      }
    }

    // Store metadata (expiry)
    if (tokens.expires_in) {
      const metadata = { expiresAt: Date.now() + tokens.expires_in * 1000 }
      this.secretsBridge.setPluginSecret(
        providerId,
        `${providerId}:oauth_token_metadata`,
        JSON.stringify(metadata)
      )
    }
  }
}
