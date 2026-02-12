// GitHub Plugin — main entry point
// Registers all data sources, actions, and AI pipelines with the DevRig sandbox.

import type { PluginContext, SyncResult, ActionResult, InboxItemOutput } from '@devrig/plugin-sdk'
import { createContextFromGlobal } from '@devrig/plugin-sdk'
import { syncPullRequests, syncIssues } from './data-source'
import { approve, requestChanges, comment, merge, assign, addLabel, close } from './actions'
import { reviewPR, summarizeChanges } from './ai-pipeline'

const ctx: PluginContext = createContextFromGlobal()

// --- Data Sources ---
;(globalThis as Record<string, unknown>)['sync_pull-requests'] = (cursor?: string): Promise<SyncResult> =>
  syncPullRequests(ctx, cursor)
;(globalThis as Record<string, unknown>)['sync_issues'] = (cursor?: string): Promise<SyncResult> =>
  syncIssues(ctx, cursor)

// --- Actions ---
;(globalThis as Record<string, unknown>)['action_approve'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  approve(ctx, params)
;(globalThis as Record<string, unknown>)['action_request-changes'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  requestChanges(ctx, params)
;(globalThis as Record<string, unknown>)['action_comment'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  comment(ctx, params)
;(globalThis as Record<string, unknown>)['action_merge'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  merge(ctx, params)
;(globalThis as Record<string, unknown>)['action_assign'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  assign(ctx, params)
;(globalThis as Record<string, unknown>)['action_add-label'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  addLabel(ctx, params)
;(globalThis as Record<string, unknown>)['action_close'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  close(ctx, params)

// --- AI Pipelines ---
;(globalThis as Record<string, unknown>)['pipeline_review-pr'] = (items: InboxItemOutput[]): Promise<unknown> =>
  reviewPR(ctx, items)
;(globalThis as Record<string, unknown>)['pipeline_summarize-changes'] = (items: InboxItemOutput[]): Promise<unknown> =>
  summarizeChanges(ctx, items)
