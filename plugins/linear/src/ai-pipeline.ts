import type { PluginContext, InboxItemOutput } from '@devrig/plugin-sdk'

export async function planTicket(ctx: PluginContext, items: InboxItemOutput[]): Promise<unknown> {
  const item = items[0]
  if (!item) throw new Error('No item provided for ticket planning')

  const metadata = (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata ?? {}) as Record<string, unknown>

  const result = await ctx.requestAI('complete', {
    messages: [
      {
        role: 'user',
        content: [
          `Break this Linear issue into subtasks and suggest an implementation approach.`,
          ``,
          `Issue: ${item.title}`,
          item.body ? `Description: ${item.body}` : '',
          metadata.labels ? `Labels: ${(metadata.labels as string[]).join(', ')}` : '',
          metadata.estimate ? `Current estimate: ${metadata.estimate} points` : '',
          ``,
          `Provide:`,
          `1. 3-7 concrete subtasks with clear acceptance criteria`,
          `2. Suggested implementation order`,
          `3. Key risks or dependencies to watch for`,
          `4. Estimated total effort (in story points 1-8)`
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    maxTokens: 2000
  })

  return { itemId: item.id, plan: result }
}

export async function estimateComplexity(ctx: PluginContext, items: InboxItemOutput[]): Promise<unknown> {
  const item = items[0]
  if (!item) throw new Error('No item provided for complexity estimation')

  const metadata = (typeof item.metadata === 'string' ? JSON.parse(item.metadata) : item.metadata ?? {}) as Record<string, unknown>

  const result = await ctx.requestAI('complete', {
    messages: [
      {
        role: 'user',
        content: [
          `Estimate the complexity of this Linear issue on a scale of 1-5.`,
          ``,
          `Issue: ${item.title}`,
          item.body ? `Description: ${item.body}` : '',
          metadata.labels ? `Labels: ${(metadata.labels as string[]).join(', ')}` : '',
          ``,
          `Scale:`,
          `1 = Trivial (< 1 hour, single file change)`,
          `2 = Simple (few hours, well-defined scope)`,
          `3 = Medium (1-2 days, multiple components)`,
          `4 = Complex (3-5 days, cross-cutting concerns)`,
          `5 = Very Complex (1+ week, architectural changes)`,
          ``,
          `Respond with:`,
          `- Complexity: [1-5]`,
          `- Reasoning: [2-3 sentences explaining the estimate]`,
          `- Key factors: [what drives the complexity]`
        ]
          .filter(Boolean)
          .join('\n')
      }
    ],
    maxTokens: 500
  })

  return { itemId: item.id, estimate: result }
}
