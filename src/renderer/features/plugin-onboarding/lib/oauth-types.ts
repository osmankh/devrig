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
