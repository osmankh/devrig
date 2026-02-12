import type { PluginContext, InboxItemOutput } from '@devrig/plugin-sdk'

export async function classifyEmails(ctx: PluginContext, items: InboxItemOutput[]): Promise<unknown> {
  if (!items || items.length === 0) return { results: [] }

  const classifyItems = items.map((item) => ({
    id: item.id,
    title: item.title,
    preview: item.preview ?? '',
    metadata: typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata
  }))

  return ctx.requestAI('classify', {
    items: classifyItems,
    labels: ['important', 'needs_reply', 'fyi', 'noise'],
    context:
      "These are emails from a developer's Gmail inbox. Classify by how urgently they need attention. " +
      '"important" = requires prompt action, "needs_reply" = someone expects a reply, ' +
      '"fyi" = informational but not urgent, "noise" = newsletters/notifications/spam.'
  })
}

export async function draftReply(ctx: PluginContext, items: InboxItemOutput[]): Promise<unknown> {
  // For draft-reply, items contains a single item to draft a reply for
  const item = items[0]
  if (!item) throw new Error('No item provided for draft reply')

  const metadata = (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata) as Record<string, unknown>

  return ctx.requestAI('draft', {
    item: {
      id: item.id,
      title: item.title,
      body: item.body ?? item.preview ?? '',
      type: 'email'
    },
    intent: 'reply',
    tone: 'professional',
    context: metadata.from ? `Replying to: ${metadata.from}` : undefined
  })
}
