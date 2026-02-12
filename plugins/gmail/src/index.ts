// Gmail Plugin — main entry point
// Registers all data sources, actions, and AI pipelines with the DevRig sandbox.

import type { PluginContext, SyncResult, ActionResult, InboxItemOutput } from '@devrig/plugin-sdk'
import { createContextFromGlobal } from '@devrig/plugin-sdk'
import { syncEmails } from './data-source'
import { reply, archive, label } from './actions'
import { classifyEmails, draftReply } from './ai-pipeline'

const ctx: PluginContext = createContextFromGlobal()

// --- Data Source: emails ---
;(globalThis as Record<string, unknown>)['sync_emails'] = (cursor?: string): Promise<SyncResult> =>
  syncEmails(ctx, cursor)

// --- Actions ---
;(globalThis as Record<string, unknown>)['action_reply'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  reply(ctx, params)
;(globalThis as Record<string, unknown>)['action_archive'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  archive(ctx, params)
;(globalThis as Record<string, unknown>)['action_label'] = (params: Record<string, unknown>): Promise<ActionResult> =>
  label(ctx, params)

// --- AI Pipelines ---
;(globalThis as Record<string, unknown>)['pipeline_classify-emails'] = (items: InboxItemOutput[]): Promise<unknown> =>
  classifyEmails(ctx, items)
;(globalThis as Record<string, unknown>)['pipeline_draft-reply'] = (items: InboxItemOutput[]): Promise<unknown> =>
  draftReply(ctx, items)
