// Linear Plugin — main entry point
// Registers all data sources, actions, and AI pipelines with the DevRig sandbox.

import type { PluginContext, SyncResult, ActionResult, InboxItemOutput } from '@devrig/plugin-sdk'
import { createContextFromGlobal } from '@devrig/plugin-sdk'
import { syncAssignedIssues } from './data-source'
import { updateStatus, assignIssue, commentOnIssue, createSubIssue, setPriority } from './actions'
import { planTicket, estimateComplexity } from './ai-pipeline'

const ctx: PluginContext = createContextFromGlobal()

// --- Data Source: assigned-issues ---
;(globalThis as Record<string, unknown>)['sync_assigned-issues'] = (cursor?: string): Promise<SyncResult> =>
  syncAssignedIssues(ctx, cursor)

// --- Actions ---
;(globalThis as Record<string, unknown>)['action_update-status'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  updateStatus(ctx, params)
;(globalThis as Record<string, unknown>)['action_assign'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  assignIssue(ctx, params)
;(globalThis as Record<string, unknown>)['action_comment'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  commentOnIssue(ctx, params)
;(globalThis as Record<string, unknown>)['action_create-sub-issue'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  createSubIssue(ctx, params)
;(globalThis as Record<string, unknown>)['action_set-priority'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  setPriority(ctx, params)

// --- AI Pipelines ---
;(globalThis as Record<string, unknown>)['pipeline_plan-ticket'] = (items: InboxItemOutput[]): Promise<unknown> =>
  planTicket(ctx, items)
;(globalThis as Record<string, unknown>)['pipeline_estimate-complexity'] = (items: InboxItemOutput[]): Promise<unknown> =>
  estimateComplexity(ctx, items)
