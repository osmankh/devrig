import type { PluginContext, SyncResult, InboxItemInput } from '@devrig/plugin-sdk'
import { graphql } from './auth'

const LINEAR_PRIORITY_MAP: Record<number, 'critical' | 'high' | 'normal' | 'low'> = {
  0: 'normal',
  1: 'critical',
  2: 'high',
  3: 'normal',
  4: 'low'
}

const ASSIGNED_ISSUES_QUERY = `
  query AssignedIssues($after: String) {
    viewer {
      assignedIssues(
        first: 50
        after: $after
        filter: { state: { type: { nin: ["completed", "canceled"] } } }
        orderBy: updatedAt
      ) {
        pageInfo {
          hasNextPage
          endCursor
        }
        nodes {
          id
          identifier
          title
          description
          priority
          estimate
          url
          createdAt
          updatedAt
          state {
            id
            name
            type
          }
          team {
            id
            name
            key
          }
          labels {
            nodes {
              name
            }
          }
          project {
            name
          }
          cycle {
            name
            number
          }
          parent {
            id
            identifier
          }
        }
      }
    }
  }
`

interface LinearIssue {
  id: string
  identifier: string
  title: string
  description: string | null
  priority: number
  estimate: number | null
  url: string
  createdAt: string
  updatedAt: string
  state: { id: string; name: string; type: string }
  team: { id: string; name: string; key: string }
  labels: { nodes: Array<{ name: string }> }
  project: { name: string } | null
  cycle: { name: string; number: number } | null
  parent: { id: string; identifier: string } | null
}

export async function syncAssignedIssues(ctx: PluginContext, cursor?: string): Promise<SyncResult> {
  let data: unknown
  try {
    data = await graphql(ctx, ASSIGNED_ISSUES_QUERY, { after: cursor ?? null })
  } catch (e) {
    ctx.log('error', `Linear sync failed: ${(e as Error).message}`)
    return { items: [], hasMore: false }
  }

  const viewer = (data as { viewer: { assignedIssues: { nodes: LinearIssue[]; pageInfo: { hasNextPage: boolean; endCursor: string | null } } } }).viewer
  const { nodes: issues, pageInfo } = viewer.assignedIssues

  if (issues.length === 0) {
    return { items: [], cursor: cursor, hasMore: false }
  }

  const items: InboxItemInput[] = issues.map((issue) => ({
    externalId: issue.id,
    type: 'issue',
    title: `[${issue.identifier}] ${issue.title}`,
    body: issue.description ?? undefined,
    preview: [
      issue.state?.name,
      issue.team?.key,
      issue.labels?.nodes?.map((l) => l.name).join(', '),
      issue.project?.name,
      issue.cycle ? `Cycle ${issue.cycle.number}` : null
    ]
      .filter(Boolean)
      .join(' · '),
    sourceUrl: issue.url,
    priority: LINEAR_PRIORITY_MAP[issue.priority] ?? 'normal',
    isActionable: issue.state?.type !== 'completed' && issue.state?.type !== 'canceled',
    metadata: {
      identifier: issue.identifier,
      issueId: issue.id,
      status: issue.state?.name,
      statusType: issue.state?.type,
      stateId: issue.state?.id,
      priority: issue.priority,
      estimate: issue.estimate,
      teamId: issue.team?.id,
      teamKey: issue.team?.key,
      labels: issue.labels?.nodes?.map((l) => l.name) ?? [],
      project: issue.project?.name ?? null,
      cycle: issue.cycle ? { name: issue.cycle.name, number: issue.cycle.number } : null,
      parentId: issue.parent?.id ?? null,
      parentIdentifier: issue.parent?.identifier ?? null
    },
    externalCreatedAt: new Date(issue.createdAt).getTime()
  }))

  await ctx.storeItems(items)
  ctx.emitEvent('items_synced', { count: items.length })

  return {
    items,
    cursor: pageInfo.endCursor ?? undefined,
    hasMore: pageInfo.hasNextPage
  }
}
