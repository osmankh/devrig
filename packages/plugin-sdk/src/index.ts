// ---------------------------------------------------------------------------
// @devrig/plugin-sdk — Barrel Exports
// ---------------------------------------------------------------------------

// Types
export type {
  PluginManifest,
  PluginAuthor,
  PluginPermissions,
  PluginCapabilities,
  DataSourceCapability,
  ActionCapability,
  ActionParameter,
  AiPipelineCapability,
  ViewCapability,
  FlowNodeCapability,
  PluginContext,
  DataSource,
  SyncResult,
  Action,
  ActionResult,
  AIPipeline,
  PipelineResult,
  InboxItemInput,
  InboxItemOutput,
  ItemFilter,
  FetchOptions,
  FetchResponse,
  AICompletionParams,
  AIClassifyParams,
  AISummarizeParams,
  AIDraftParams,
  DevRigAPI
} from './types'

// Helpers
export {
  createContextFromGlobal,
  defineDataSource,
  defineAction,
  registerDataSource,
  registerAction,
  registerPipeline,
  paginateItems,
  buildPreview,
  createItem
} from './helpers'
