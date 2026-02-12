import type { PluginContext, ActionResult } from '@devrig/plugin-sdk'
import { apiUrl, getAuthHeaders, assertOk } from './auth'

async function findItem(ctx: PluginContext, itemId: string) {
  const items = await ctx.queryItems({ limit: 10000 })
  const item = items.find((i) => i.id === itemId || i.externalId === itemId)
  if (!item) throw new Error(`Item not found: ${itemId}`)
  const metadata = (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata) as Record<string, unknown>
  return { item, metadata }
}

export async function reply(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const itemId = String(params.itemId)
  const body = String(params.body)
  const headers = await getAuthHeaders(ctx)
  const { item, metadata } = await findItem(ctx, itemId)

  const threadId = metadata.threadId as string
  if (!threadId) throw new Error('No threadId found on item')

  const from = (metadata.from as string) || ''
  const subject = item.title.startsWith('Re:') ? item.title : `Re: ${item.title}`

  // Build RFC 2822 message and base64url-encode it
  const rawMessage = [
    `To: ${from}`,
    `Subject: ${subject}`,
    `In-Reply-To: ${item.externalId}`,
    `References: ${item.externalId}`,
    '',
    body
  ].join('\r\n')
  const raw = btoa(rawMessage).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

  const resp = await ctx.fetch(apiUrl('/messages/send'), {
    method: 'POST',
    headers,
    body: JSON.stringify({ raw, threadId })
  })
  assertOk(resp, 'send reply')

  ctx.emitEvent('reply_sent', { itemId, threadId })
  return { success: true, message: 'Reply sent' }
}

export async function archive(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const itemId = String(params.itemId)
  const headers = await getAuthHeaders(ctx)
  const { item } = await findItem(ctx, itemId)

  const resp = await ctx.fetch(apiUrl(`/messages/${item.externalId}/modify`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ removeLabelIds: ['INBOX'] })
  })
  assertOk(resp, 'archive email')

  await ctx.archive([item.id])
  ctx.emitEvent('email_archived', { itemId })
  return { success: true, message: 'Email archived' }
}

export async function label(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const itemId = String(params.itemId)
  const labelId = String(params.labelId)
  const headers = await getAuthHeaders(ctx)
  const { item } = await findItem(ctx, itemId)

  const resp = await ctx.fetch(apiUrl(`/messages/${item.externalId}/modify`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ addLabelIds: [labelId] })
  })
  assertOk(resp, 'apply label')

  ctx.emitEvent('label_applied', { itemId, labelId })
  return { success: true, message: `Label ${labelId} applied` }
}
