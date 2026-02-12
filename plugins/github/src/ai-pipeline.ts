import type { PluginContext, InboxItemOutput } from '@devrig/plugin-sdk'
import { apiUrl, getAuthHeaders, assertOk } from './auth'

export async function reviewPR(ctx: PluginContext, items: InboxItemOutput[]): Promise<unknown> {
  const prs = items.filter((i) => i.type === 'pull-request')
  if (prs.length === 0) return { results: [] }

  const results: Array<{ itemId: string; review: unknown }> = []

  for (const pr of prs) {
    const metadata = (typeof pr.metadata === 'string' ? JSON.parse(pr.metadata) : pr.metadata ?? {}) as Record<string, unknown>
    const repo = metadata.repo as string
    const number = metadata.number as number
    if (!repo || !number) continue

    // Fetch the diff
    let diff = ''
    try {
      const headers = await getAuthHeaders(ctx)
      const diffResp = await ctx.fetch(apiUrl(`/repos/${repo}/pulls/${number}`), {
        headers: { ...headers, Accept: 'application/vnd.github.diff' }
      })
      if (diffResp.status === 200) {
        diff = typeof diffResp.body === 'string' ? diffResp.body : JSON.stringify(diffResp.body)
      }
    } catch {
      ctx.log('warn', `Failed to fetch diff for ${repo}#${number}`)
    }

    if (!diff) continue

    // Truncate large diffs to fit context window
    const truncatedDiff = diff.length > 15000 ? diff.slice(0, 15000) + '\n\n... (diff truncated)' : diff

    const review = await ctx.requestAI('complete', {
      messages: [
        {
          role: 'user',
          content: `Review this pull request diff. Identify potential bugs, style issues, performance concerns, and suggest improvements. Be concise and actionable.\n\nPR: ${pr.title}\n\nDiff:\n\`\`\`diff\n${truncatedDiff}\n\`\`\``
        }
      ],
      maxTokens: 1500
    })

    results.push({ itemId: pr.id, review })
  }

  return { results }
}

export async function summarizeChanges(ctx: PluginContext, items: InboxItemOutput[]): Promise<unknown> {
  const prs = items.filter((i) => i.type === 'pull-request')
  if (prs.length === 0) return { results: [] }

  const results: Array<{ itemId: string; summary: unknown }> = []

  for (const pr of prs) {
    const metadata = (typeof pr.metadata === 'string' ? JSON.parse(pr.metadata) : pr.metadata ?? {}) as Record<string, unknown>

    const summary = await ctx.requestAI('summarize', {
      content: [
        `PR: ${pr.title}`,
        pr.body ? `Description: ${pr.body}` : '',
        `Branch: ${metadata.branch} → ${metadata.baseBranch}`,
        `Changes: +${metadata.additions ?? 0} -${metadata.deletions ?? 0} in ${metadata.changedFiles ?? 0} files`
      ]
        .filter(Boolean)
        .join('\n'),
      maxLength: 200,
      style: 'brief'
    })

    results.push({ itemId: pr.id, summary })
  }

  return { results }
}
