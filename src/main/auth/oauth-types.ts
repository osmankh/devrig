export type OAuthFlowType = 'authorization_code' | 'device_code'

export interface OAuthProviderConfig {
  providerId: string
  flowType: OAuthFlowType
  authUrl: string
  tokenUrl: string
  clientId: string
  clientSecret?: string
  scopes: string[]
  tokenMapping: Record<string, string>
}

export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
  scope?: string
}

export interface DeviceCodeResponse {
  device_code: string
  user_code: string
  verification_uri: string
  expires_in: number
  interval: number
}

export interface OAuthStartResult {
  type: 'browser_opened' | 'device_code'
  userCode?: string
  verificationUri?: string
}

export interface OAuthPollResult {
  status: 'pending' | 'complete' | 'expired' | 'denied'
}

export interface OAuthStatusResult {
  connected: boolean
  expiresAt?: number
}
