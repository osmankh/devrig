import type { PluginContext, FetchResponse } from '@devrig/plugin-sdk'

const GMAIL_API = 'https://gmail.googleapis.com/gmail/v1/users/me'

export function apiUrl(path: string): string {
  return `${GMAIL_API}${path}`
}

export async function getAuthHeaders(ctx: PluginContext): Promise<Record<string, string>> {
  const token = await ctx.getSecret('gmail_oauth_token')
  if (!token) throw new Error('Gmail OAuth token not configured')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
}

export function assertOk(resp: FetchResponse, operation: string): void {
  if (resp.status >= 200 && resp.status < 300) return
  if (resp.status === 401) {
    throw new Error(`Gmail: authentication failed (401) during ${operation}. Token may be expired.`)
  }
  throw new Error(`Gmail ${operation} failed: ${resp.status} ${resp.statusText}`)
}
