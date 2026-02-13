import type { OAuthProviderConfig } from './oauth-types'

export function getOAuthConfig(providerId: string): OAuthProviderConfig | null {
  switch (providerId) {
    case 'gmail':
      return getGmailConfig()
    case 'github':
      return getGitHubConfig()
    case 'linear':
      return getLinearConfig()
    default:
      return null
  }
}

function getGmailConfig(): OAuthProviderConfig | null {
  const clientId = process.env['DEVRIG_GOOGLE_CLIENT_ID']
  const clientSecret = process.env['DEVRIG_GOOGLE_CLIENT_SECRET']
  if (!clientId || !clientSecret) return null

  return {
    providerId: 'gmail',
    flowType: 'authorization_code',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    clientId,
    clientSecret,
    scopes: [
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/gmail.modify',
      'https://www.googleapis.com/auth/gmail.send'
    ],
    tokenMapping: {
      access_token: 'gmail_oauth_token',
      refresh_token: 'gmail_refresh_token'
    }
  }
}

function getGitHubConfig(): OAuthProviderConfig | null {
  const clientId = process.env['DEVRIG_GITHUB_CLIENT_ID']
  if (!clientId) return null

  return {
    providerId: 'github',
    flowType: 'device_code',
    authUrl: 'https://github.com/login/device/code',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    clientId,
    scopes: ['repo', 'read:user', 'notifications'],
    tokenMapping: {
      access_token: 'github_token'
    }
  }
}

function getLinearConfig(): OAuthProviderConfig | null {
  const clientId = process.env['DEVRIG_LINEAR_CLIENT_ID']
  const clientSecret = process.env['DEVRIG_LINEAR_CLIENT_SECRET']
  if (!clientId || !clientSecret) return null

  return {
    providerId: 'linear',
    flowType: 'authorization_code',
    authUrl: 'https://linear.app/oauth/authorize',
    tokenUrl: 'https://api.linear.app/oauth/token',
    clientId,
    clientSecret,
    scopes: ['read', 'write', 'issues:create'],
    tokenMapping: {
      access_token: 'linear_api_key'
    }
  }
}
