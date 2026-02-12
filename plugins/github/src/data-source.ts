import type { PluginContext, SyncResult, InboxItemInput } from '@devrig/plugin-sdk'
import { apiUrl, getAuthHeaders, assertOk } from './auth'

interface GitHubPR {
  id: number
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  draft: boolean
  user: { login: string }
  head: { ref: string }
  base: { ref: string; repo: { full_name: string } }
  additions: number
  deletions: number
  changed_files: number
  requested_reviewers: Array<{ login: string }>
  updated_at: string
  created_at: string
}

interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string | null
  html_url: string
  state: string
  user: { login: string }
  labels: Array<{ name: string }>
  milestone: { title: string } | null
  repository: { full_name: string }
  updated_at: string
  created_at: string
}

function prPriority(pr: GitHubPR): 'critical' | 'high' | 'normal' | 'low' {
  if (pr.requested_reviewers?.length > 0) return 'critical'
  if (pr.draft) return 'low'
  return 'normal'
}

export async function syncPullRequests(ctx: PluginContext, cursor?: string): Promise<SyncResult> {
  let headers: Record<string, string>
  try {
    headers = await getAuthHeaders(ctx)
  } catch {
    ctx.log('warn', 'GitHub: no token configured, skipping PR sync')
    return { items: [], hasMore: false }
  }

  // Fetch PRs where user is involved (assigned, review-requested, or mentioned)
  let url = apiUrl('/search/issues?q=type:pr+involves:@me+is:open&sort=updated&per_page=50')
  if (cursor) {
    url += `&since=${cursor}`
  }

  const resp = await ctx.fetch(url, { headers })
  assertOk(resp, 'search pull requests')

  const body = resp.body as { items?: GitHubPR[]; total_count?: number }
  const prs = body.items ?? []
  if (prs.length === 0) {
    return { items: [], cursor, hasMore: false }
  }

  const items: InboxItemInput[] = prs.map((pr) => {
    const repo = pr.base?.repo?.full_name ?? ''
    return {
      externalId: String(pr.id),
      type: 'pull-request',
      title: `[${repo}#${pr.number}] ${pr.title}`,
      body: pr.body ?? undefined,
      preview: `${repo} · ${pr.head?.ref} → ${pr.base?.ref} · +${pr.additions ?? 0} -${pr.deletions ?? 0}`,
      sourceUrl: pr.html_url,
      priority: prPriority(pr),
      isActionable: true,
      metadata: {
        repo,
        number: pr.number,
        branch: pr.head?.ref,
        baseBranch: pr.base?.ref,
        additions: pr.additions,
        deletions: pr.deletions,
        changedFiles: pr.changed_files,
        state: pr.state,
        draft: pr.draft,
        author: pr.user?.login,
        reviewers: pr.requested_reviewers?.map((r) => r.login) ?? []
      },
      externalCreatedAt: new Date(pr.created_at).getTime()
    }
  })

  await ctx.storeItems(items)
  ctx.emitEvent('items_synced', { count: items.length, type: 'pull-request' })

  const newCursor = new Date().toISOString()
  return {
    items,
    cursor: newCursor,
    hasMore: (body.total_count ?? 0) > 50
  }
}

export async function syncIssues(ctx: PluginContext, cursor?: string): Promise<SyncResult> {
  let headers: Record<string, string>
  try {
    headers = await getAuthHeaders(ctx)
  } catch {
    ctx.log('warn', 'GitHub: no token configured, skipping issue sync')
    return { items: [], hasMore: false }
  }

  let url = apiUrl('/search/issues?q=type:issue+involves:@me+is:open&sort=updated&per_page=50')
  if (cursor) {
    url += `&since=${cursor}`
  }

  const resp = await ctx.fetch(url, { headers })
  assertOk(resp, 'search issues')

  const body = resp.body as { items?: GitHubIssue[]; total_count?: number }
  const issues = body.items ?? []
  if (issues.length === 0) {
    return { items: [], cursor, hasMore: false }
  }

  const items: InboxItemInput[] = issues.map((issue) => {
    const repo = issue.repository?.full_name ?? ''
    return {
      externalId: String(issue.id),
      type: 'issue',
      title: `[${repo}#${issue.number}] ${issue.title}`,
      body: issue.body ?? undefined,
      preview: `${repo} · ${issue.labels?.map((l) => l.name).join(', ') || 'no labels'}`,
      sourceUrl: issue.html_url,
      priority: 'normal',
      isActionable: true,
      metadata: {
        repo,
        number: issue.number,
        state: issue.state,
        labels: issue.labels?.map((l) => l.name) ?? [],
        milestone: issue.milestone?.title ?? null,
        author: issue.user?.login
      },
      externalCreatedAt: new Date(issue.created_at).getTime()
    }
  })

  await ctx.storeItems(items)
  ctx.emitEvent('items_synced', { count: items.length, type: 'issue' })

  const newCursor = new Date().toISOString()
  return {
    items,
    cursor: newCursor,
    hasMore: (body.total_count ?? 0) > 50
  }
}
