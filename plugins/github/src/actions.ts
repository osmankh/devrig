import type { PluginContext, ActionResult } from '@devrig/plugin-sdk'
import { apiUrl, getAuthHeaders, findItem, assertOk } from './auth'

async function submitReview(ctx: PluginContext, params: Record<string, unknown>, event: string): Promise<ActionResult> {
  const { item, metadata } = await findItem(ctx, String(params.itemId))
  if (item.type !== 'pull-request') throw new Error('Item is not a pull request')

  const repo = metadata.repo as string
  const number = metadata.number as number
  if (!repo || !number) throw new Error('Missing repo or PR number in metadata')

  const headers = await getAuthHeaders(ctx)
  const resp = await ctx.fetch(apiUrl(`/repos/${repo}/pulls/${number}/reviews`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: String(params.body ?? ''), event })
  })
  assertOk(resp, `submit review (${event})`)

  ctx.emitEvent('review_submitted', { itemId: params.itemId, event })
  return { success: true, message: `Review submitted: ${event}` }
}

export async function approve(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  return submitReview(ctx, params, 'APPROVE')
}

export async function requestChanges(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  return submitReview(ctx, params, 'REQUEST_CHANGES')
}

export async function comment(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { metadata } = await findItem(ctx, String(params.itemId))
  const repo = metadata.repo as string
  const number = metadata.number as number
  if (!repo || !number) throw new Error('Missing repo or number in metadata')

  const headers = await getAuthHeaders(ctx)
  const resp = await ctx.fetch(apiUrl(`/repos/${repo}/issues/${number}/comments`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ body: String(params.body) })
  })
  assertOk(resp, 'post comment')

  ctx.emitEvent('comment_posted', { itemId: params.itemId })
  return { success: true, message: 'Comment posted' }
}

export async function merge(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { item, metadata } = await findItem(ctx, String(params.itemId))
  if (item.type !== 'pull-request') throw new Error('Item is not a pull request')

  const repo = metadata.repo as string
  const number = metadata.number as number
  if (!repo || !number) throw new Error('Missing repo or PR number in metadata')

  const headers = await getAuthHeaders(ctx)
  const mergeMethod = String(params.mergeMethod ?? 'merge')
  const resp = await ctx.fetch(apiUrl(`/repos/${repo}/pulls/${number}/merge`), {
    method: 'PUT',
    headers,
    body: JSON.stringify({ merge_method: mergeMethod })
  })
  assertOk(resp, 'merge PR')

  ctx.emitEvent('pr_merged', { itemId: params.itemId, mergeMethod })
  return { success: true, message: 'PR merged' }
}

export async function assign(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { metadata } = await findItem(ctx, String(params.itemId))
  const repo = metadata.repo as string
  const number = metadata.number as number
  if (!repo || !number) throw new Error('Missing repo or number in metadata')

  const headers = await getAuthHeaders(ctx)
  const assignees = params.assignees as string[]
  const resp = await ctx.fetch(apiUrl(`/repos/${repo}/issues/${number}/assignees`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ assignees })
  })
  assertOk(resp, 'assign users')

  return { success: true, message: `Assigned: ${assignees.join(', ')}` }
}

export async function addLabel(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { metadata } = await findItem(ctx, String(params.itemId))
  const repo = metadata.repo as string
  const number = metadata.number as number
  if (!repo || !number) throw new Error('Missing repo or number in metadata')

  const headers = await getAuthHeaders(ctx)
  const labels = params.labels as string[]
  const resp = await ctx.fetch(apiUrl(`/repos/${repo}/issues/${number}/labels`), {
    method: 'POST',
    headers,
    body: JSON.stringify({ labels })
  })
  assertOk(resp, 'add labels')

  return { success: true, message: `Labels added: ${labels.join(', ')}` }
}

export async function close(ctx: PluginContext, params: Record<string, unknown>): Promise<ActionResult> {
  const { metadata } = await findItem(ctx, String(params.itemId))
  const repo = metadata.repo as string
  const number = metadata.number as number
  if (!repo || !number) throw new Error('Missing repo or number in metadata')

  const headers = await getAuthHeaders(ctx)
  const resp = await ctx.fetch(apiUrl(`/repos/${repo}/issues/${number}`), {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ state: 'closed' })
  })
  assertOk(resp, 'close issue')

  ctx.emitEvent('issue_closed', { itemId: params.itemId })
  return { success: true, message: 'Issue closed' }
}
