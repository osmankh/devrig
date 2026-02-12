import type { PluginContext, SyncResult, InboxItemInput } from '@devrig/plugin-sdk'
import { apiUrl, getAuthHeaders, assertOk } from './auth'

const MAX_RESULTS = 50

interface GmailHeader {
  name: string
  value: string
}

interface GmailMessage {
  id: string
  threadId: string
  snippet: string
  internalDate: string
  labelIds: string[]
  payload?: {
    headers?: GmailHeader[]
  }
}

function extractHeader(headers: GmailHeader[], name: string): string {
  return headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? ''
}

export async function syncEmails(ctx: PluginContext, cursor?: string): Promise<SyncResult> {
  let headers: Record<string, string>
  try {
    headers = await getAuthHeaders(ctx)
  } catch {
    ctx.log('warn', 'Gmail: no OAuth token configured, skipping sync')
    return { items: [], hasMore: false }
  }

  // Use historyId for incremental sync if available
  if (cursor) {
    return syncIncremental(ctx, headers, cursor)
  }
  return syncFull(ctx, headers)
}

async function syncFull(
  ctx: PluginContext,
  headers: Record<string, string>
): Promise<SyncResult> {
  const listResp = await ctx.fetch(
    apiUrl(`/messages?q=${encodeURIComponent('in:inbox')}&maxResults=${MAX_RESULTS}`),
    { headers }
  )
  assertOk(listResp, 'list messages')

  const body = listResp.body as { messages?: Array<{ id: string }>; resultSizeEstimate?: number }
  const messageRefs = body.messages ?? []
  if (messageRefs.length === 0) {
    return { items: [], hasMore: false }
  }

  const items = await fetchMessageDetails(ctx, headers, messageRefs)
  await ctx.storeItems(items)
  ctx.emitEvent('items_synced', { count: items.length })

  // Use the profile's historyId as cursor for subsequent incremental syncs
  const profileResp = await ctx.fetch(apiUrl('/profile'), { headers })
  const profile = profileResp.body as { historyId?: string }
  const newCursor = profile.historyId

  return {
    items,
    cursor: newCursor,
    hasMore: (body.resultSizeEstimate ?? 0) > MAX_RESULTS
  }
}

async function syncIncremental(
  ctx: PluginContext,
  headers: Record<string, string>,
  historyId: string
): Promise<SyncResult> {
  const historyResp = await ctx.fetch(
    apiUrl(`/history?startHistoryId=${historyId}&historyTypes=messageAdded&maxResults=${MAX_RESULTS}`),
    { headers }
  )

  if (historyResp.status === 404) {
    // historyId expired, fall back to full sync
    ctx.log('info', 'Gmail: historyId expired, doing full sync')
    return syncFull(ctx, headers)
  }
  assertOk(historyResp, 'list history')

  const body = historyResp.body as {
    history?: Array<{ messagesAdded?: Array<{ message: { id: string } }> }>
    historyId?: string
  }

  const messageRefs: Array<{ id: string }> = []
  for (const entry of body.history ?? []) {
    for (const added of entry.messagesAdded ?? []) {
      messageRefs.push({ id: added.message.id })
    }
  }

  if (messageRefs.length === 0) {
    return { items: [], cursor: body.historyId ?? historyId, hasMore: false }
  }

  // Deduplicate
  const uniqueIds = [...new Set(messageRefs.map((m) => m.id))]
  const items = await fetchMessageDetails(ctx, headers, uniqueIds.map((id) => ({ id })))
  await ctx.storeItems(items)
  ctx.emitEvent('items_synced', { count: items.length })

  return {
    items,
    cursor: body.historyId ?? historyId,
    hasMore: false
  }
}

async function fetchMessageDetails(
  ctx: PluginContext,
  headers: Record<string, string>,
  messageRefs: Array<{ id: string }>
): Promise<InboxItemInput[]> {
  const items: InboxItemInput[] = []

  for (const ref of messageRefs) {
    const resp = await ctx.fetch(
      apiUrl(`/messages/${ref.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date`),
      { headers }
    )
    if (resp.status !== 200) continue

    const msg = resp.body as GmailMessage
    const msgHeaders = msg.payload?.headers ?? []
    const subject = extractHeader(msgHeaders, 'Subject') || '(no subject)'
    const from = extractHeader(msgHeaders, 'From')
    const to = extractHeader(msgHeaders, 'To')
    const cc = extractHeader(msgHeaders, 'Cc')
    const isUnread = msg.labelIds?.includes('UNREAD') ?? false
    const isStarred = msg.labelIds?.includes('STARRED') ?? false

    items.push({
      externalId: msg.id,
      type: 'email',
      title: subject,
      preview: msg.snippet,
      sourceUrl: `https://mail.google.com/mail/u/0/#inbox/${msg.id}`,
      priority: isStarred ? 'high' : 'normal',
      isActionable: isUnread,
      metadata: {
        from,
        to,
        cc,
        threadId: msg.threadId,
        labelIds: msg.labelIds,
        isUnread,
        isStarred
      },
      externalCreatedAt: msg.internalDate ? Number(msg.internalDate) : undefined
    })
  }

  return items
}
