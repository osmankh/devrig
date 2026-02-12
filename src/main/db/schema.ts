import { sqliteTable, text, integer, real, index } from 'drizzle-orm/sqlite-core'

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  settings: text('settings').default('{}'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const workflows = sqliteTable(
  'workflows',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id),
    name: text('name').notNull(),
    description: text('description').default(''),
    status: text('status').notNull().default('draft'),
    triggerConfig: text('trigger_config').default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [
    index('idx_workflows_workspace').on(table.workspaceId, table.updatedAt)
  ]
)

export const flowNodes = sqliteTable(
  'flow_nodes',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    label: text('label').notNull().default(''),
    x: real('x').notNull().default(0),
    y: real('y').notNull().default(0),
    config: text('config').default('{}'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [index('idx_flow_nodes_workflow').on(table.workflowId)]
)

export const flowEdges = sqliteTable(
  'flow_edges',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id, { onDelete: 'cascade' }),
    sourceNodeId: text('source_node_id')
      .notNull()
      .references(() => flowNodes.id, { onDelete: 'cascade' }),
    targetNodeId: text('target_node_id')
      .notNull()
      .references(() => flowNodes.id, { onDelete: 'cascade' }),
    sourceHandle: text('source_handle'),
    targetHandle: text('target_handle'),
    label: text('label').default(''),
    createdAt: integer('created_at').notNull()
  },
  (table) => [
    index('idx_flow_edges_source').on(table.sourceNodeId),
    index('idx_flow_edges_target').on(table.targetNodeId)
  ]
)

export const executions = sqliteTable(
  'executions',
  {
    id: text('id').primaryKey(),
    workflowId: text('workflow_id')
      .notNull()
      .references(() => workflows.id),
    status: text('status').notNull().default('pending'),
    triggerType: text('trigger_type').notNull(),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    error: text('error'),
    createdAt: integer('created_at').notNull()
  },
  (table) => [
    index('idx_executions_workflow').on(table.workflowId, table.startedAt)
  ]
)

export const executionSteps = sqliteTable(
  'execution_steps',
  {
    id: text('id').primaryKey(),
    executionId: text('execution_id')
      .notNull()
      .references(() => executions.id, { onDelete: 'cascade' }),
    nodeId: text('node_id').notNull(),
    status: text('status').notNull().default('pending'),
    input: text('input'),
    output: text('output'),
    error: text('error'),
    startedAt: integer('started_at'),
    completedAt: integer('completed_at'),
    durationMs: integer('duration_ms')
  },
  (table) => [
    index('idx_execution_steps_execution').on(table.executionId)
  ]
)

export const secrets = sqliteTable('secrets', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  encryptedValue: text('encrypted_value').notNull(),
  provider: text('provider').notNull().default('safeStorage'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const plugins = sqliteTable('plugins', {
  id: text('id').primaryKey(),
  name: text('name').notNull().unique(),
  version: text('version').notNull(),
  manifest: text('manifest').notNull(),
  enabled: integer('enabled').notNull().default(1),
  installedAt: integer('installed_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const settings = sqliteTable('settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at').notNull()
})

// ============================================================
// UNIFIED INBOX (Plugin Data Aggregation)
// ============================================================

export const inboxItems = sqliteTable(
  'inbox_items',
  {
    id: text('id').primaryKey(),
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    externalId: text('external_id').notNull(),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body'),
    preview: text('preview'),
    sourceUrl: text('source_url'),
    priority: integer('priority').notNull().default(0),
    status: text('status').notNull().default('unread'),
    aiClassification: text('ai_classification'),
    aiSummary: text('ai_summary'),
    aiDraft: text('ai_draft'),
    metadata: text('metadata').default('{}'),
    isActionable: integer('is_actionable').notNull().default(0),
    snoozedUntil: integer('snoozed_until'),
    externalCreatedAt: integer('external_created_at'),
    syncedAt: integer('synced_at').notNull(),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [
    index('idx_inbox_items_plugin').on(table.pluginId, table.status),
    index('idx_inbox_items_status').on(table.status, table.priority, table.updatedAt),
    index('idx_inbox_items_external').on(table.pluginId, table.externalId),
    index('idx_inbox_items_snoozed').on(table.snoozedUntil),
    index('idx_inbox_items_actionable').on(table.isActionable),
    index('idx_inbox_items_type').on(table.pluginId, table.type)
  ]
)

// ============================================================
// PLUGIN SYNC STATE
// ============================================================

export const pluginSyncState = sqliteTable(
  'plugin_sync_state',
  {
    pluginId: text('plugin_id')
      .notNull()
      .references(() => plugins.id, { onDelete: 'cascade' }),
    dataSourceId: text('data_source_id').notNull(),
    lastSyncAt: integer('last_sync_at'),
    syncCursor: text('sync_cursor'),
    syncStatus: text('sync_status').notNull().default('idle'),
    error: text('error'),
    itemsSynced: integer('items_synced').notNull().default(0),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull()
  },
  (table) => [
    index('idx_pss_status').on(table.syncStatus),
    index('idx_pss_plugin').on(table.pluginId)
  ]
)

// ============================================================
// AI OPERATIONS (Unified Cost Tracking)
// ============================================================

export const aiOperations = sqliteTable(
  'ai_operations',
  {
    id: text('id').primaryKey(),
    provider: text('provider').notNull(),
    model: text('model').notNull(),
    operation: text('operation').notNull(),
    pluginId: text('plugin_id').references(() => plugins.id, { onDelete: 'set null' }),
    pipelineId: text('pipeline_id'),
    inboxItemId: text('inbox_item_id').references(() => inboxItems.id, { onDelete: 'set null' }),
    executionId: text('execution_id').references(() => executions.id, { onDelete: 'set null' }),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: real('cost_usd').notNull().default(0.0),
    durationMs: integer('duration_ms'),
    createdAt: integer('created_at').notNull()
  },
  (table) => [
    index('idx_ai_ops_provider').on(table.provider, table.createdAt),
    index('idx_ai_ops_plugin').on(table.pluginId, table.createdAt),
    index('idx_ai_ops_created').on(table.createdAt)
  ]
)

// Type exports
export type Workspace = typeof workspaces.$inferSelect
export type NewWorkspace = typeof workspaces.$inferInsert
export type Workflow = typeof workflows.$inferSelect
export type NewWorkflow = typeof workflows.$inferInsert
export type FlowNode = typeof flowNodes.$inferSelect
export type NewFlowNode = typeof flowNodes.$inferInsert
export type FlowEdge = typeof flowEdges.$inferSelect
export type NewFlowEdge = typeof flowEdges.$inferInsert
export type Execution = typeof executions.$inferSelect
export type ExecutionStep = typeof executionSteps.$inferSelect
export type Secret = typeof secrets.$inferSelect
export type Plugin = typeof plugins.$inferSelect
export type Setting = typeof settings.$inferSelect
export type InboxItem = typeof inboxItems.$inferSelect
export type NewInboxItem = typeof inboxItems.$inferInsert
export type PluginSyncState = typeof pluginSyncState.$inferSelect
export type NewPluginSyncState = typeof pluginSyncState.$inferInsert
export type AiOperation = typeof aiOperations.$inferSelect
export type NewAiOperation = typeof aiOperations.$inferInsert
