// ---------------------------------------------------------------------------
// @devrig/plugin-sdk — Type Definitions
// ---------------------------------------------------------------------------

// --- Manifest Types ---

export interface PluginManifest {
  id: string
  name: string
  version: string
  description: string
  author: PluginAuthor
  icon?: string
  homepage?: string
  repository?: string
  permissions?: PluginPermissions
  capabilities?: PluginCapabilities
  minAppVersion?: string
  maxAppVersion?: string
}

export interface PluginAuthor {
  name: string
  email?: string
  url?: string
}

export interface PluginPermissions {
  network?: string[]
  secrets?: string[]
  ai?: boolean
  filesystem?: string[]
}

export interface PluginCapabilities {
  dataSources?: DataSourceCapability[]
  actions?: ActionCapability[]
  aiPipelines?: AiPipelineCapability[]
  views?: ViewCapability[]
  flowNodes?: FlowNodeCapability[]
}

export interface DataSourceCapability {
  id: string
  name: string
  entryPoint: string
  syncInterval?: number
  description?: string
}

export interface ActionCapability {
  id: string
  name: string
  entryPoint: string
  description?: string
  parameters?: Record<string, ActionParameter>
}

export interface ActionParameter {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array'
  description?: string
  required?: boolean
}

export interface AiPipelineCapability {
  id: string
  name: string
  entryPoint: string
  trigger: 'onNewItems' | 'onAction' | 'manual'
  description?: string
}

export interface ViewCapability {
  id: string
  name: string
  entryPoint: string
  target: 'detail-panel' | 'settings' | 'dashboard'
  description?: string
}

export interface FlowNodeCapability {
  id: string
  name: string
  entryPoint: string
  type: 'trigger' | 'action' | 'condition'
  description?: string
}

// --- Plugin Context (passed to plugin entry points) ---

export interface PluginContext {
  log: (level: 'info' | 'warn' | 'error', message: string) => void
  fetch: (url: string, options?: FetchOptions) => Promise<FetchResponse>
  getSecret: (key: string) => Promise<string | null>
  storeItems: (items: InboxItemInput[]) => Promise<void>
  queryItems: (filter?: ItemFilter) => Promise<InboxItemOutput[]>
  markRead: (ids: string[]) => Promise<void>
  archive: (ids: string[]) => Promise<void>
  emitEvent: (name: string, data: unknown) => void
  requestAI: (operation: string, params: unknown) => Promise<unknown>
}

// --- Data Source ---

export interface DataSource {
  id: string
  sync: (ctx: PluginContext, cursor?: string) => Promise<SyncResult>
}

export interface SyncResult {
  items: InboxItemInput[]
  cursor?: string
  hasMore: boolean
}

// --- Action ---

export interface Action {
  id: string
  execute: (ctx: PluginContext, params: Record<string, unknown>) => Promise<ActionResult>
}

export interface ActionResult {
  success: boolean
  message?: string
  data?: unknown
}

// --- AI Pipeline ---

export interface AIPipeline {
  id: string
  run: (ctx: PluginContext, items: InboxItemOutput[]) => Promise<PipelineResult>
}

export interface PipelineResult {
  processed: number
  results: Array<{
    itemId: string
    classification?: string
    summary?: string
    draft?: string
  }>
}

// --- Inbox Item Types ---

export interface InboxItemInput {
  externalId: string
  type: string
  title: string
  body?: string
  preview?: string
  sourceUrl?: string
  priority?: 'critical' | 'high' | 'normal' | 'low'
  metadata?: Record<string, unknown>
  isActionable?: boolean
  externalCreatedAt?: number
}

export interface InboxItemOutput {
  id: string
  pluginId: string
  externalId: string
  type: string
  title: string
  body?: string | null
  preview?: string | null
  sourceUrl?: string | null
  priority?: string | null
  status: string
  metadata?: Record<string, unknown>
  isActionable?: boolean
  externalCreatedAt?: number | null
  createdAt: number
  updatedAt: number
}

export interface ItemFilter {
  types?: string[]
  status?: string[]
  limit?: number
  offset?: number
}

// --- Fetch Types ---

export interface FetchOptions {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export interface FetchResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: unknown
}

// --- AI Types ---

export interface AICompletionParams {
  messages: Array<{ role: 'user' | 'assistant' | 'system'; content: string }>
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface AIClassifyParams {
  items: Array<{ id: string; title: string; body?: string }>
  labels: string[]
  context?: string
}

export interface AISummarizeParams {
  content: string
  maxLength?: number
  style?: 'brief' | 'detailed' | 'bullet-points'
}

export interface AIDraftParams {
  item: { id: string; title: string; body: string; type: string }
  intent?: string
  tone?: 'professional' | 'casual' | 'concise'
}

// --- DevRig API (available as `devrig` global in sandbox) ---

export interface DevRigAPI {
  log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void

  fetch(url: string, options?: FetchOptions): Promise<FetchResponse>
  getSecret(key: string): Promise<string | null>

  storeItems(items: InboxItemInput[]): Promise<void>
  queryItems(filter?: ItemFilter): Promise<InboxItemOutput[]>
  markRead(ids: string[]): Promise<void>
  archive(ids: string[]): Promise<void>

  emitEvent(name: string, data?: unknown): void
  requestAI(operation: string, params: unknown): Promise<unknown>
}

// --- Global augmentation (for plugin code) ---

declare global {
  const devrig: DevRigAPI
}
