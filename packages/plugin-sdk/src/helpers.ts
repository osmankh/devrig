// ---------------------------------------------------------------------------
// @devrig/plugin-sdk — Helper Utilities for Plugin Authors
// ---------------------------------------------------------------------------

import type { PluginContext, DataSource, Action, SyncResult, ActionResult, InboxItemInput, InboxItemOutput } from './types'

/**
 * Create a PluginContext from the global `devrig` API.
 * Convenience for plugins that need a PluginContext-shaped object.
 */
export function createContextFromGlobal(): PluginContext {
  return {
    log: (level, message) => devrig.log(level, message),
    fetch: (url, options) => devrig.fetch(url, options),
    getSecret: (key) => devrig.getSecret(key),
    storeItems: (items) => devrig.storeItems(items),
    queryItems: (filter) => devrig.queryItems(filter),
    markRead: (ids) => devrig.markRead(ids),
    archive: (ids) => devrig.archive(ids),
    emitEvent: (name, data) => devrig.emitEvent(name, data),
    requestAI: (operation, params) => devrig.requestAI(operation, params)
  }
}

/**
 * Define a data source with type safety.
 */
export function defineDataSource(config: DataSource): DataSource {
  return config
}

/**
 * Define an action with type safety.
 */
export function defineAction(config: Action): Action {
  return config
}

/**
 * Register a data source sync function as a global callable.
 * The plugin manager calls `sync_{dataSourceId}` on the sandbox.
 */
export function registerDataSource(
  dataSourceId: string,
  syncFn: (ctx: PluginContext, cursor?: string) => Promise<SyncResult>
): void {
  const ctx = createContextFromGlobal();
  (globalThis as Record<string, unknown>)[`sync_${dataSourceId}`] = (cursor?: string) => syncFn(ctx, cursor)
}

/**
 * Register an action executor as a global callable.
 * The plugin manager calls `action_{actionId}` on the sandbox.
 */
export function registerAction(
  actionId: string,
  executeFn: (ctx: PluginContext, params: Record<string, unknown>) => Promise<ActionResult>
): void {
  const ctx = createContextFromGlobal();
  (globalThis as Record<string, unknown>)[`action_${actionId}`] = (params: Record<string, unknown>) => executeFn(ctx, params)
}

/**
 * Register an AI pipeline as a global callable.
 * The plugin manager calls `pipeline_{pipelineId}` on the sandbox.
 */
export function registerPipeline(
  pipelineId: string,
  runFn: (ctx: PluginContext, items: InboxItemOutput[]) => Promise<unknown>
): void {
  const ctx = createContextFromGlobal();
  (globalThis as Record<string, unknown>)[`pipeline_${pipelineId}`] = (items: InboxItemOutput[]) => runFn(ctx, items)
}

/**
 * Paginate through all items matching a filter.
 */
export async function paginateItems(
  ctx: PluginContext,
  filter: { types?: string[]; status?: string[] } = {},
  pageSize = 50
): Promise<InboxItemOutput[]> {
  const all: InboxItemOutput[] = []
  let offset = 0

  while (true) {
    const page = await ctx.queryItems({ ...filter, limit: pageSize, offset })
    all.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }

  return all
}

/**
 * Build a preview string from HTML or long text (truncate + strip tags).
 */
export function buildPreview(text: string, maxLength = 200): string {
  const stripped = text.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (stripped.length <= maxLength) return stripped
  return stripped.slice(0, maxLength - 3) + '...'
}

/**
 * Create a standard inbox item input with defaults.
 */
export function createItem(
  overrides: InboxItemInput & { externalId: string; type: string; title: string }
): InboxItemInput {
  return {
    priority: 'normal',
    isActionable: false,
    ...overrides
  }
}
