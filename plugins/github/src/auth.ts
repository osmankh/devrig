import type { PluginContext, FetchResponse } from '@devrig/plugin-sdk'

const GITHUB_API = 'https://api.github.com'

export function apiUrl(path: string): string {
  return `${GITHUB_API}${path}`
}

export async function getAuthHeaders(ctx: PluginContext): Promise<Record<string, string>> {
  const token = await ctx.getSecret('github_token')
  if (!token) throw new Error('GitHub token not configured')
  return {
    Authorization: `token ${token}`,
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
    'X-GitHub-Api-Version': '2022-11-28'
  }
}

export async function findItem(ctx: PluginContext, itemId: string) {
  const items = await ctx.queryItems({ limit: 10000 })
  const item = items.find((i) => i.id === itemId || i.externalId === itemId)
  if (!item) throw new Error(`Item not found: ${itemId}`)
  const metadata = (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata ?? {}) as Record<string, unknown>
  return { item, metadata }
}

export function assertOk(resp: FetchResponse, operation: string): void {
  if (resp.status >= 200 && resp.status < 300) return
  if (resp.status === 401) {
    throw new Error(`GitHub: authentication failed (401) during ${operation}. Token may be invalid.`)
  }
  throw new Error(`GitHub ${operation} failed: ${resp.status} ${resp.statusText}`)
}
