import type { PluginContext, FetchResponse } from '@devrig/plugin-sdk'

const LINEAR_API = 'https://api.linear.app/graphql'

export async function graphql(
  ctx: PluginContext,
  query: string,
  variables?: Record<string, unknown>
): Promise<unknown> {
  const apiKey = await ctx.getSecret('linear_api_key')
  if (!apiKey) throw new Error('Linear API key not configured')

  const resp = await ctx.fetch(LINEAR_API, {
    method: 'POST',
    headers: {
      Authorization: apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ query, variables })
  })

  assertOk(resp, 'GraphQL request')

  const body = resp.body as { data?: unknown; errors?: Array<{ message: string }> }
  if (body.errors && body.errors.length > 0) {
    throw new Error(`Linear GraphQL error: ${body.errors[0].message}`)
  }

  return body.data
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
    throw new Error(`Linear: authentication failed (401) during ${operation}. API key may be invalid.`)
  }
  throw new Error(`Linear ${operation} failed: ${resp.status} ${resp.statusText}`)
}
