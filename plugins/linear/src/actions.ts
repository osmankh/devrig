import type { PluginContext, ActionResult } from '@devrig/plugin-sdk'
import { graphql, findItem } from './auth'

export async function updateStatus(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { metadata } = await findItem(ctx, String(params.itemId))
  const issueId = metadata.issueId as string
  if (!issueId) throw new Error('Missing issueId in metadata')

  const stateId = String(params.stateId)
  await graphql(ctx, `
    mutation UpdateIssueState($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
      }
    }
  `, { id: issueId, stateId })

  ctx.emitEvent('status_updated', { itemId: params.itemId, stateId })
  return { success: true, message: 'Status updated' }
}

export async function assignIssue(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { metadata } = await findItem(ctx, String(params.itemId))
  const issueId = metadata.issueId as string
  if (!issueId) throw new Error('Missing issueId in metadata')

  const assigneeId = String(params.assigneeId)
  await graphql(ctx, `
    mutation AssignIssue($id: String!, $assigneeId: String!) {
      issueUpdate(id: $id, input: { assigneeId: $assigneeId }) {
        success
      }
    }
  `, { id: issueId, assigneeId })

  ctx.emitEvent('issue_assigned', { itemId: params.itemId, assigneeId })
  return { success: true, message: 'Issue assigned' }
}

export async function commentOnIssue(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { metadata } = await findItem(ctx, String(params.itemId))
  const issueId = metadata.issueId as string
  if (!issueId) throw new Error('Missing issueId in metadata')

  const body = String(params.body)
  await graphql(ctx, `
    mutation CommentOnIssue($issueId: String!, $body: String!) {
      commentCreate(input: { issueId: $issueId, body: $body }) {
        success
      }
    }
  `, { issueId, body })

  ctx.emitEvent('comment_posted', { itemId: params.itemId })
  return { success: true, message: 'Comment posted' }
}

export async function createSubIssue(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { metadata } = await findItem(ctx, String(params.itemId))
  const parentId = metadata.issueId as string
  if (!parentId) throw new Error('Missing issueId in metadata')

  const title = String(params.title)
  const description = params.description ? String(params.description) : undefined
  const teamId = String(params.teamId || metadata.teamId)

  const result = await graphql(ctx, `
    mutation CreateSubIssue($title: String!, $description: String, $teamId: String!, $parentId: String!) {
      issueCreate(input: { title: $title, description: $description, teamId: $teamId, parentId: $parentId }) {
        success
        issue {
          id
          identifier
          url
        }
      }
    }
  `, { title, description, teamId, parentId }) as {
    issueCreate: { success: boolean; issue: { id: string; identifier: string; url: string } }
  }

  ctx.emitEvent('sub_issue_created', {
    itemId: params.itemId,
    subIssue: result.issueCreate.issue
  })
  return {
    success: true,
    message: `Sub-issue ${result.issueCreate.issue.identifier} created`,
    data: result.issueCreate.issue
  }
}

export async function setPriority(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { metadata } = await findItem(ctx, String(params.itemId))
  const issueId = metadata.issueId as string
  if (!issueId) throw new Error('Missing issueId in metadata')

  const priority = Number(params.priority)
  if (priority < 0 || priority > 4) throw new Error('Priority must be 0-4')

  await graphql(ctx, `
    mutation SetPriority($id: String!, $priority: Int!) {
      issueUpdate(id: $id, input: { priority: $priority }) {
        success
      }
    }
  `, { id: issueId, priority })

  ctx.emitEvent('priority_set', { itemId: params.itemId, priority })
  return { success: true, message: `Priority set to ${priority}` }
}
