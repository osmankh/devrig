# DevRig Backend Architecture

## AI-Powered Developer Command Center — Plugin-First Backend Architecture

**Version**: 2.0.0
**Date**: 2026-02-11
**Status**: Architecture Specification (Revised)

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Plugin Architecture](#2-plugin-architecture)
3. [AI Provider Layer](#3-ai-provider-layer)
4. [Sync Scheduler](#4-sync-scheduler)
5. [Automation Engine Architecture](#5-automation-engine-architecture)
6. [Trigger System Design](#6-trigger-system-design)
7. [Condition Evaluation Engine](#7-condition-evaluation-engine)
8. [Action Execution Framework](#8-action-execution-framework)
9. [Plugin SDK Design & API](#9-plugin-sdk-design--api)
10. [Database Schema (SQL DDL)](#10-database-schema-sql-ddl)
11. [Worker / Job Queue Architecture](#11-worker--job-queue-architecture)
12. [Legacy AI Integration Layer](#12-legacy-ai-integration-layer)
13. [Cloud Sync Design (Future-Ready)](#13-cloud-sync-design-future-ready)
14. [Logging & Observability](#14-logging--observability)
15. [Error Handling & Retry Strategies](#15-error-handling--retry-strategies)
16. [Package Manifest](#16-package-manifest)

---

## 1. System Overview

### 1.1 Design Philosophy

DevRig is an **AI-powered developer command center** — a local-first Electron desktop application that unifies a developer's tools, notifications, and workflows into a single intelligent interface. The core application is a **shell + AI brain**; all integrations are delivered as plugins.

Every design decision derives from five principles:

1. **Plugin-first architecture.** The core app provides four things: a plugin runtime, an AI provider layer, a unified inbox, and a flow builder. Everything else — GitHub, Linear, Slack, email, CI/CD — is a plugin. Even first-party integrations ship as plugins with no special privileges beyond being pre-installed.
2. **AI provider abstraction.** Claude is the first-class, built-in AI provider. Additional providers (OpenAI, Gemini, local models) are added as provider plugins. Every AI operation goes through a unified provider interface that handles model routing, fallback chains, cost tracking, and context management.
3. **Unified inbox backend.** All plugin data flows into a single `inbox_items` table. Plugins push items via a standardized data source contract (`storeItems()`, `queryItems()`, `markRead()`, `archive()`). The AI layer classifies, summarizes, and drafts responses across all items regardless of source.
4. **No external service dependencies at runtime.** The engine must run with zero network connectivity. Redis, RabbitMQ, Kafka — none of these may appear as a hard requirement. SQLite is the only persistence layer.
5. **Single-user performance first, multi-user sync second.** The local SQLite database is the source of truth. Cloud sync is additive, never mandatory.

### 1.2 Core Application Components

```
+------------------------------------------------------------------------+
|                         DevRig Core Application                        |
|                                                                        |
|  +-------------------+  +--------------------+  +--------------------+ |
|  |  Plugin Runtime   |  |  AI Provider Layer |  |  Unified Inbox     | |
|  |  (Host + Sandbox) |  |  (Model Router)    |  |  (Aggregator)      | |
|  +--------+----------+  +--------+-----------+  +--------+-----------+ |
|           |                      |                        |            |
|  +--------v----------+  +-------v-----------+  +---------v---------+  |
|  | Plugin Registry   |  | Provider Registry |  | Inbox Query Engine|  |
|  | Capability Catalog|  | Pipeline Engine   |  | AI Classification |  |
|  | Sync Scheduler    |  | Context Manager   |  | Smart Triage      |  |
|  +-------------------+  | Cost Tracker      |  +-------------------+  |
|                          +-------------------+                         |
|  +------------------------------------------------------------------+  |
|  |                    Flow Builder Engine                            |  |
|  |  (DAG Executor, Trigger Manager, Action Registry, Job Queue)     |  |
|  +------------------------------------------------------------------+  |
|                                                                        |
|  +------------------------------------------------------------------+  |
|  |              SQLite Database (WAL Mode)                          |  |
|  |              via better-sqlite3 + Drizzle ORM                    |  |
|  +------------------------------------------------------------------+  |
+------------------------------------------------------------------------+
         |                    |                      |
   IPC Bridge           IPC Bridge             IPC Bridge
         |                    |                      |
+------------------------------------------------------------------------+
|                     Electron Renderer Process                           |
|               (React UI — Inbox, Flow Editor, Plugin Views)            |
+------------------------------------------------------------------------+
```

All heavy computation (workflow execution, AI calls, plugin execution, database access) happens in the **Main Process** or in **Worker Threads** spawned from the Main Process. The Renderer Process communicates exclusively through typed IPC channels via `contextBridge`.

### 1.3 Core Data Flows

There are two primary data flows in DevRig: the **plugin data flow** (unified inbox) and the **flow builder execution flow**.

#### Plugin Data Flow (Primary)

```
Plugin sync fires (on schedule or webhook)
    |
    v
Plugin fetches data from external service (GitHub, Linear, Slack, etc.)
    |
    v
Plugin calls storeItems() with normalized inbox items
    |
    v
Items inserted/updated in inbox_items table
    |
    v
AI pipeline triggered on new items:
    classify() --> filter() --> summarize() --> draft()
    |
    v
AI-enriched items available in unified inbox
    |
    v
User views, acts on, or snoozes items
    (actions route back through plugin action contract)
```

#### Flow Builder Execution Flow

```
Trigger fires
    |
    v
Event emitted on internal EventBus
    |
    v
Engine Core receives event, resolves matching workflows
    |
    v
For each matched workflow:
    |
    +---> Evaluate entry conditions (Condition Engine)
    |         |
    |         +---> Conditions NOT met --> Log skip, done
    |         |
    |         +---> Conditions met --> Enqueue workflow run
    |
    v
Job Queue picks up run, assigns to Worker Thread
    |
    v
Worker Thread executes DAG:
    For each node in topological order:
        |
        +---> Evaluate node conditions
        +---> Execute action (via Action Registry)
        +---> Store output in run context
        +---> Handle errors / retries
    |
    v
Run completes --> Store results --> Emit completion event
```

---

## 2. Plugin Architecture

### 2.1 Design Rationale

DevRig treats plugins as the fundamental unit of integration. The core application deliberately avoids hard-coding any specific service integration. GitHub, Linear, Slack, email, Jira, Notion — all are plugins. First-party plugins ship pre-installed but use the exact same APIs and sandbox as third-party plugins.

This design provides:
- **Decoupled development**: Integration teams work independently without touching core code.
- **User control**: Users install only the integrations they need.
- **Ecosystem growth**: Third-party developers extend DevRig without gating.
- **Testability**: Each plugin is an isolated unit with a well-defined contract.

### 2.2 Plugin Manifest Schema

Every plugin declares its capabilities in a `devrig-plugin.json` manifest:

```json
{
  "name": "devrig-plugin-github",
  "version": "1.0.0",
  "displayName": "GitHub",
  "description": "GitHub notifications, PRs, issues, and actions",
  "author": "DevRig",
  "license": "MIT",
  "engine": ">=1.0.0",
  "main": "./dist/index.js",
  "icon": "./assets/icon.svg",
  "permissions": [
    "network",
    "secrets:read",
    "inbox:write",
    "ai:classify"
  ],
  "capabilities": {
    "dataSources": [
      {
        "id": "github.notifications",
        "name": "GitHub Notifications",
        "description": "Pull requests, issues, reviews, CI status",
        "defaultSyncIntervalMs": 60000,
        "configSchema": "./schemas/notifications-config.json"
      },
      {
        "id": "github.pull_requests",
        "name": "Pull Requests",
        "description": "Open PRs across configured repositories",
        "defaultSyncIntervalMs": 120000,
        "configSchema": "./schemas/pr-config.json"
      }
    ],
    "actions": [
      {
        "id": "github.merge_pr",
        "name": "Merge Pull Request",
        "description": "Merge a pull request with configurable strategy",
        "inputSchema": "./schemas/merge-pr-input.json",
        "outputSchema": "./schemas/merge-pr-output.json",
        "appliesTo": ["github.pull_requests"]
      },
      {
        "id": "github.create_issue",
        "name": "Create Issue",
        "inputSchema": "./schemas/create-issue-input.json",
        "outputSchema": "./schemas/create-issue-output.json"
      },
      {
        "id": "github.comment",
        "name": "Add Comment",
        "inputSchema": "./schemas/comment-input.json",
        "appliesTo": ["github.pull_requests", "github.notifications"]
      }
    ],
    "aiPipelines": [
      {
        "id": "github.classify_notification",
        "name": "Classify GitHub Notification",
        "description": "Classify notification urgency and category",
        "appliesTo": ["github.notifications"],
        "stages": ["classify", "summarize"],
        "promptTemplates": {
          "classify": "./prompts/classify-notification.md",
          "summarize": "./prompts/summarize-notification.md"
        }
      },
      {
        "id": "github.draft_review",
        "name": "Draft PR Review",
        "appliesTo": ["github.pull_requests"],
        "stages": ["summarize", "draft"],
        "promptTemplates": {
          "summarize": "./prompts/summarize-pr.md",
          "draft": "./prompts/draft-review.md"
        }
      }
    ],
    "views": [
      {
        "id": "github.pr_detail",
        "name": "PR Detail View",
        "component": "./views/PRDetailView",
        "appliesTo": ["github.pull_requests"]
      }
    ],
    "flowNodes": [
      {
        "type": "trigger",
        "id": "github.push",
        "name": "GitHub Push Event",
        "configSchema": "./schemas/push-trigger.json"
      },
      {
        "type": "action",
        "id": "github.create_issue",
        "name": "Create GitHub Issue",
        "category": "github",
        "inputSchema": "./schemas/create-issue-input.json",
        "outputSchema": "./schemas/create-issue-output.json"
      },
      {
        "type": "condition",
        "id": "github.is_default_branch",
        "name": "Is Default Branch"
      }
    ]
  },
  "settingsSchema": "./schemas/settings.json"
}
```

### 2.3 Capability Types

| Capability | Description | Contract |
|-----------|-------------|----------|
| **dataSources** | Defines data the plugin can fetch and push into the unified inbox. Each data source has its own sync interval and configuration. | `storeItems()`, `queryItems()`, `markRead()`, `archive()` |
| **actions** | Operations the plugin can perform on inbox items or external services. Actions can be scoped to specific data source types via `appliesTo`. | `execute(input, context): ActionResult` |
| **aiPipelines** | AI processing rules the plugin defines for its data. Pipelines are composable stages (classify, filter, summarize, draft) with plugin-provided prompt templates. | Prompt templates + stage configuration |
| **views** | Custom UI components the plugin registers for rendering inbox items or detail views. | React component contract (rendered in sandboxed iframe) |
| **flowNodes** | Trigger, action, and condition nodes the plugin registers for use in the flow builder. | Same contract as existing flow builder nodes (Section 9) |

### 2.4 Plugin Lifecycle

```
install --> validate --> permission_request --> sandbox --> register_capabilities --> sync --> active

install:
  - User selects plugin from marketplace or provides npm package name
  - npm install in isolated directory (~/.devrig/plugins/<name>/)
  - Store metadata in plugins table

validate:
  - Parse and validate devrig-plugin.json manifest against schema
  - Check engine version compatibility (semver range)
  - Verify all referenced schemas and prompt templates exist and parse
  - Validate permission declarations are complete for declared capabilities
    (e.g., dataSources require inbox:write, aiPipelines require ai:classify)

permission_request:
  - Present user with permission summary dialog
  - User approves or rejects
  - Store granted permissions in plugins table

sandbox:
  - Load plugin entry point in isolated-vm V8 isolate (see Section 9.3)
  - Inject SDK with permission-gated host functions
  - Apply resource limits (128MB memory, 5s CPU timeout per invocation)

register_capabilities:
  - Call plugin.activate(sdk) lifecycle hook
  - Plugin registers data sources, actions, AI pipelines, views, flow nodes
  - Core validates each registration against the manifest (no undeclared capabilities)
  - Capabilities stored in plugin_capabilities table for fast lookup

sync:
  - For each registered data source, create initial sync job
  - Sync scheduler picks up jobs and runs first sync
  - Plugin fetches data and calls storeItems() to populate inbox

active:
  - Plugin is fully operational
  - Data sources sync on configured intervals
  - Actions available in inbox context menus and flow builder
  - AI pipelines run on new/updated inbox items
  - Views render when user opens matching inbox items
```

### 2.5 Plugin Data Source Contract

Plugins interact with the unified inbox through a standardized data source API injected via the SDK:

```typescript
interface PluginDataSourceSDK {
  /**
   * Store or update items in the unified inbox.
   * Items are upserted by (plugin_id, external_id).
   * The plugin is responsible for mapping its domain data to InboxItem format.
   */
  storeItems(items: InboxItemInput[]): Promise<{ created: number; updated: number }>;

  /**
   * Query items previously stored by this plugin.
   * Plugins can only query their own items (enforced by sandbox).
   */
  queryItems(query: InboxQuery): Promise<InboxItem[]>;

  /**
   * Mark items as read. Updates the status field.
   */
  markRead(externalIds: string[]): Promise<void>;

  /**
   * Archive items. Moves them out of the active inbox.
   */
  archive(externalIds: string[]): Promise<void>;

  /**
   * Report sync progress for UI feedback.
   */
  reportSyncProgress(progress: SyncProgress): void;
}

interface InboxItemInput {
  externalId: string;            // Unique ID within this plugin (e.g., GitHub notification ID)
  type: string;                  // Plugin-scoped type (e.g., 'pull_request', 'issue', 'review')
  title: string;
  body?: string;                 // Full content (markdown supported)
  preview?: string;              // Short preview text (max 280 chars)
  sourceUrl?: string;            // URL to open in browser
  priority?: 'urgent' | 'high' | 'normal' | 'low';
  isActionable?: boolean;        // Does this item require user action?
  metadata?: Record<string, unknown>;  // Plugin-specific structured data
  externalCreatedAt?: string;    // When the item was created in the source system
}

interface InboxQuery {
  types?: string[];
  status?: ('unread' | 'read' | 'archived' | 'snoozed')[];
  priority?: string[];
  isActionable?: boolean;
  search?: string;               // Full-text search in title + body
  limit?: number;
  offset?: number;
  orderBy?: 'created_at' | 'updated_at' | 'priority';
}
```

### 2.6 Plugin Action Contract

Actions operate on inbox items or external services. They are surfaced in the UI as context menu items, command palette entries, and flow builder nodes:

```typescript
interface PluginActionSDK {
  /**
   * Register an action handler.
   * The action ID must match one declared in the manifest.
   */
  registerAction(actionId: string, handler: ActionHandler): void;
}

type ActionHandler = (
  input: unknown,
  context: ActionContext
) => Promise<ActionResult>;

interface ActionContext {
  /** The inbox item this action was invoked on (if applicable) */
  inboxItem?: InboxItem;
  /** Scoped logger */
  logger: Logger;
  /** Secret access (permission-gated) */
  secrets: SecretsAccessor;
  /** HTTP client (permission-gated) */
  http: HttpClient;
  /** Abort signal for cancellation */
  signal: AbortSignal;
}

interface ActionResult {
  success: boolean;
  output?: unknown;
  /** If the action modified the inbox item, return the updated fields */
  itemUpdate?: Partial<InboxItemInput>;
  error?: { code: string; message: string };
}
```

### 2.7 Plugin AI Pipeline Contract

Plugins define AI processing pipelines for their data sources. Pipelines are composable chains of stages:

```typescript
interface PluginAIPipelineSDK {
  /**
   * Register an AI pipeline.
   * Pipeline ID must match one declared in the manifest.
   */
  registerPipeline(pipelineId: string, config: PipelineConfig): void;
}

interface PipelineConfig {
  /** Which data source types this pipeline applies to */
  appliesTo: string[];

  /** When to run: on new items, on update, or manual */
  trigger: 'on_new' | 'on_update' | 'manual';

  /** Ordered list of pipeline stages */
  stages: PipelineStage[];
}

type PipelineStage =
  | ClassifyStage
  | FilterStage
  | SummarizeStage
  | DraftStage;

interface ClassifyStage {
  type: 'classify';
  /** Prompt template with {{item.title}}, {{item.body}}, {{item.metadata}} variables */
  promptTemplate: string;
  /** Classification categories */
  categories: string[];
  /** Model preference (optional, defaults to AI provider layer routing) */
  model?: string;
}

interface FilterStage {
  type: 'filter';
  /** Condition to continue pipeline. If false, remaining stages are skipped. */
  condition: (classification: Record<string, unknown>) => boolean;
}

interface SummarizeStage {
  type: 'summarize';
  promptTemplate: string;
  maxTokens?: number;
  model?: string;
}

interface DraftStage {
  type: 'draft';
  promptTemplate: string;
  /** Draft type hint for UI rendering */
  draftType: 'reply' | 'comment' | 'review' | 'message';
  model?: string;
}
```

### 2.8 Plugin View Contract

Plugins register custom views for rendering inbox items. Views are React components rendered in sandboxed iframes:

```typescript
interface PluginViewSDK {
  /**
   * Register a view component.
   * View ID must match one declared in the manifest.
   */
  registerView(viewId: string, config: ViewConfig): void;
}

interface ViewConfig {
  /** Which inbox item types this view applies to */
  appliesTo: string[];
  /** The React component (bundled, loaded in sandboxed iframe) */
  component: string;  // Path relative to plugin root
  /** Default dimensions */
  defaultWidth?: number;
  defaultHeight?: number;
}
```

### 2.9 Plugin Flow Node Contract

Plugins register nodes for the flow builder. This extends the existing trigger, action, and condition system:

```typescript
interface PluginFlowNodeSDK {
  /**
   * Register a trigger node. When the trigger fires, it creates a TriggerEvent.
   */
  registerTrigger(nodeId: string, handler: TriggerHandler): void;

  /**
   * Register an action node for the flow builder.
   */
  registerFlowAction(nodeId: string, executor: ActionExecutor): void;

  /**
   * Register a condition node for the flow builder.
   */
  registerCondition(nodeId: string, evaluator: ConditionEvaluator): void;
}
```

> **Note**: The flow node contract is identical to the existing Plugin SDK API in Section 9.4. It is listed here for completeness; plugins that only need flow builder integration can use the simpler Section 9 interface.

---

## 3. AI Provider Layer

### 3.1 Provider Interface

All AI operations in DevRig go through a unified provider interface. This abstraction allows model routing, fallback chains, and cost tracking across providers:

```typescript
interface AIProvider {
  readonly id: string;             // e.g., 'anthropic', 'openai', 'ollama'
  readonly name: string;           // e.g., 'Anthropic Claude'
  readonly models: AIModelInfo[];

  /** Generate a complete response */
  complete(request: AICompleteRequest): Promise<AICompleteResponse>;

  /** Stream a response token-by-token */
  stream(request: AICompleteRequest): AsyncIterable<AIStreamEvent>;

  /** Classify content into categories */
  classify(request: AIClassifyRequest): Promise<AIClassifyResponse>;

  /** Generate a summary */
  summarize(request: AISummarizeRequest): Promise<AISummarizeResponse>;

  /** Draft a response (reply, comment, review) */
  draft(request: AIDraftRequest): Promise<AIDraftResponse>;

  /** Check if the provider is configured and reachable */
  healthCheck(): Promise<{ ok: boolean; error?: string }>;
}

interface AIModelInfo {
  id: string;                      // e.g., 'claude-sonnet-4-20250514'
  name: string;                    // e.g., 'Claude Sonnet 4'
  contextWindow: number;           // e.g., 200000
  maxOutputTokens: number;         // e.g., 8192
  supportedOperations: AIOperation[];
  inputPricePer1kTokens: number;
  outputPricePer1kTokens: number;
}

type AIOperation = 'complete' | 'stream' | 'classify' | 'summarize' | 'draft';

interface AICompleteRequest {
  model?: string;                  // If omitted, model router selects
  systemPrompt?: string;
  messages: AIMessage[];
  maxTokens?: number;
  temperature?: number;
  responseFormat?: 'text' | 'json';
  jsonSchema?: object;
  tools?: ToolDefinition[];
  signal?: AbortSignal;
}

interface AICompleteResponse {
  content: string;
  model: string;
  provider: string;
  usage: AIUsage;
  durationMs: number;
  finishReason: 'end_turn' | 'max_tokens' | 'tool_use' | 'stop';
}

interface AIUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  totalCostUsd: number;
}

interface AIClassifyRequest {
  content: string;
  categories: string[];
  model?: string;
  promptOverride?: string;
}

interface AIClassifyResponse {
  classification: string;         // The selected category
  confidence: number;             // 0-1
  reasoning?: string;
  usage: AIUsage;
}

interface AISummarizeRequest {
  content: string;
  maxLength?: number;              // Max summary length in tokens
  style?: 'brief' | 'detailed' | 'bullet_points';
  model?: string;
  promptOverride?: string;
}

interface AISummarizeResponse {
  summary: string;
  usage: AIUsage;
}

interface AIDraftRequest {
  content: string;                 // The content to draft a response to
  draftType: 'reply' | 'comment' | 'review' | 'message';
  context?: string;                // Additional context (e.g., thread history)
  tone?: 'professional' | 'casual' | 'concise';
  model?: string;
  promptOverride?: string;
}

interface AIDraftResponse {
  draft: string;
  usage: AIUsage;
}
```

### 3.2 Claude Provider (Built-In, First-Class)

The Claude provider is built into the core application and serves as the default for all operations:

```typescript
class ClaudeProvider implements AIProvider {
  readonly id = 'anthropic';
  readonly name = 'Anthropic Claude';
  readonly models: AIModelInfo[] = [
    {
      id: 'claude-sonnet-4-20250514',
      name: 'Claude Sonnet 4',
      contextWindow: 200_000,
      maxOutputTokens: 8192,
      supportedOperations: ['complete', 'stream', 'classify', 'summarize', 'draft'],
      inputPricePer1kTokens: 0.003,
      outputPricePer1kTokens: 0.015,
    },
    {
      id: 'claude-opus-4-20250514',
      name: 'Claude Opus 4',
      contextWindow: 200_000,
      maxOutputTokens: 32768,
      supportedOperations: ['complete', 'stream', 'classify', 'summarize', 'draft'],
      inputPricePer1kTokens: 0.015,
      outputPricePer1kTokens: 0.075,
    },
    {
      id: 'claude-haiku-3-20250307',
      name: 'Claude Haiku 3',
      contextWindow: 200_000,
      maxOutputTokens: 4096,
      supportedOperations: ['complete', 'stream', 'classify', 'summarize', 'draft'],
      inputPricePer1kTokens: 0.00025,
      outputPricePer1kTokens: 0.00125,
    },
  ];

  // Implementation wraps @anthropic-ai/sdk (see Section 12 for details)
}
```

### 3.3 Additional Providers (As Plugins)

Non-Claude AI providers are installed as plugins. They implement the same `AIProvider` interface:

```typescript
// devrig-plugin-openai/src/index.ts
devrig.activate(async (sdk) => {
  sdk.ai.registerProvider({
    id: 'openai',
    name: 'OpenAI',
    models: [
      { id: 'gpt-4o', name: 'GPT-4o', contextWindow: 128000, /* ... */ },
      { id: 'gpt-4o-mini', name: 'GPT-4o Mini', contextWindow: 128000, /* ... */ },
    ],
    complete: async (request) => { /* ... */ },
    stream: async function*(request) { /* ... */ },
    classify: async (request) => { /* ... */ },
    summarize: async (request) => { /* ... */ },
    draft: async (request) => { /* ... */ },
    healthCheck: async () => { /* ... */ },
  });
});

// devrig-plugin-ollama/src/index.ts (local models)
devrig.activate(async (sdk) => {
  sdk.ai.registerProvider({
    id: 'ollama',
    name: 'Ollama (Local)',
    models: [], // Discovered dynamically from local Ollama instance
    // ...
  });
});
```

### 3.4 Model Router

The model router selects the appropriate model for each AI operation based on task requirements, user preferences, and cost constraints:

```typescript
interface ModelRouter {
  /**
   * Select the best model for a given operation.
   * Considers: task type, user preferences, cost tier, model availability, fallback chains.
   */
  route(request: RouteRequest): RoutedModel;

  /** Configure routing rules */
  setRules(rules: RoutingRules): void;
}

interface RouteRequest {
  operation: AIOperation;
  pluginId?: string;               // Plugin requesting the operation
  preferredModel?: string;         // Explicit model preference
  contextSize?: number;            // Estimated input size in tokens
  budgetConstraint?: 'cheapest' | 'balanced' | 'best';
}

interface RoutedModel {
  providerId: string;
  modelId: string;
  reason: string;                  // Why this model was selected
}

interface RoutingRules {
  /** Default model per operation type */
  defaults: Record<AIOperation, { providerId: string; modelId: string }>;

  /** Per-plugin model overrides */
  pluginOverrides: Record<string, Record<AIOperation, { providerId: string; modelId: string }>>;

  /** Fallback chain: if primary fails, try these in order */
  fallbackChain: Array<{ providerId: string; modelId: string }>;

  /** Cost routing: use cheaper models for high-volume operations */
  costTiers: {
    classify: 'cheapest' | 'balanced' | 'best';
    summarize: 'cheapest' | 'balanced' | 'best';
    draft: 'cheapest' | 'balanced' | 'best';
    complete: 'cheapest' | 'balanced' | 'best';
  };
}
```

**Default routing strategy**:
- `classify` operations use the cheapest available model (Haiku 3 or GPT-4o Mini).
- `summarize` operations use a balanced model (Sonnet 4 or GPT-4o).
- `draft` operations use a balanced model with higher temperature.
- `complete` operations use the user's preferred default model.
- If the selected model fails, the router walks the fallback chain.

### 3.5 AI Pipeline Engine

The pipeline engine executes composable AI pipelines defined by plugins. A pipeline is a sequence of stages that process inbox items:

```typescript
interface AIPipelineEngine {
  /**
   * Execute a pipeline on an inbox item.
   * Runs each stage in order, passing outputs from one stage as inputs to the next.
   */
  execute(pipelineId: string, item: InboxItem): Promise<PipelineResult>;

  /**
   * Execute pipelines for all new/updated items from a plugin.
   * Called automatically after each sync cycle.
   */
  processNewItems(pluginId: string, itemIds: string[]): Promise<void>;
}

interface PipelineResult {
  pipelineId: string;
  itemId: string;
  stages: StageResult[];
  totalUsage: AIUsage;
  durationMs: number;
}

interface StageResult {
  type: 'classify' | 'filter' | 'summarize' | 'draft';
  output: unknown;
  skipped: boolean;                // True if a filter stage stopped the pipeline
  usage?: AIUsage;
  durationMs: number;
}
```

**Pipeline execution flow**:

```
1. classify stage:
   - Render prompt template with item data
   - Call AIProvider.classify()
   - Store result in inbox_items.ai_classification

2. filter stage:
   - Evaluate condition against classification result
   - If false, skip remaining stages (e.g., filter out low-priority notifications)

3. summarize stage:
   - Render prompt template with item data + classification
   - Call AIProvider.summarize()
   - Store result in inbox_items.ai_summary

4. draft stage:
   - Render prompt template with item data + classification + summary
   - Call AIProvider.draft()
   - Store result in inbox_items.ai_draft
```

### 3.6 Cost Tracker

All AI operations are tracked in the `ai_operations` table (see Section 10). The cost tracker provides real-time budget enforcement:

```typescript
interface CostTracker {
  /** Record a completed AI operation */
  record(operation: AIOperationRecord): void;

  /** Get total cost for a time period */
  getTotalCost(period: { from: string; to: string }): Promise<number>;

  /** Get cost breakdown by provider */
  getCostByProvider(period: { from: string; to: string }): Promise<Record<string, number>>;

  /** Get cost breakdown by plugin */
  getCostByPlugin(period: { from: string; to: string }): Promise<Record<string, number>>;

  /** Get cost breakdown by pipeline */
  getCostByPipeline(period: { from: string; to: string }): Promise<Record<string, number>>;

  /** Check if a tier's budget limit is exceeded */
  checkBudget(tierLimit: number): Promise<{ exceeded: boolean; currentCost: number; remaining: number }>;
}

interface AIOperationRecord {
  provider: string;
  model: string;
  operation: AIOperation;
  pluginId?: string;
  pipelineId?: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
}
```

### 3.7 Context Manager

The context manager handles smart context injection for AI operations. It manages token budgets and truncation strategies per plugin and operation type:

```typescript
interface ContextManager {
  /**
   * Build context for an AI operation.
   * Assembles system prompt, item content, conversation history, and plugin-specific context.
   * Truncates intelligently to fit within the model's context window.
   */
  buildContext(request: ContextBuildRequest): BuiltContext;
}

interface ContextBuildRequest {
  modelId: string;                 // To determine context window size
  operation: AIOperation;
  item?: InboxItem;
  pluginContext?: string;          // Plugin-provided additional context
  conversationHistory?: AIMessage[];
  maxContextTokens?: number;       // Override: max tokens for context (default: 80% of window)
}

interface BuiltContext {
  systemPrompt: string;
  messages: AIMessage[];
  estimatedTokens: number;
  truncated: boolean;
  truncationStrategy: 'none' | 'tail' | 'middle' | 'summary';
}
```

**Truncation strategies**:
- **Tail truncation**: Remove oldest messages first (default for conversation history).
- **Middle truncation**: Keep the beginning and end, remove the middle (for long documents).
- **Summary truncation**: Replace truncated content with an AI-generated summary (for very large contexts, uses cheapest model).

---

## 4. Sync Scheduler

### 4.1 Overview

The sync scheduler manages background data synchronization for all plugins. It replaces traditional cron-based approaches with a SQLite-backed job queue that supports configurable intervals, incremental sync, and plugin-specific cursors.

### 4.2 Architecture

```
+------------------------------------------------------------------+
|                       Sync Scheduler                              |
|                                                                   |
|  +------------------+  +-------------------+  +-----------------+ |
|  | Schedule Manager |  | Job Executor      |  | State Tracker   | |
|  | (Interval Timer) |  | (Plugin Invoker)  |  | (Cursor/Status) | |
|  +--------+---------+  +--------+----------+  +--------+--------+ |
|           |                      |                      |         |
|  +--------v---------+  +--------v----------+  +--------v--------+ |
|  | Plugin Registry  |  | Plugin Sandbox    |  | plugin_sync_state| |
|  | (Data Sources)   |  | (isolated-vm)     |  | (SQLite table)  | |
|  +------------------+  +-------------------+  +-----------------+ |
+------------------------------------------------------------------+
```

### 4.3 Sync Job Queue

The sync scheduler uses the existing SQLite-backed job queue (Section 11) with a dedicated `plugin_sync` job type:

```typescript
interface SyncScheduler {
  /** Start the scheduler. Registers timers for all active plugin data sources. */
  start(): void;

  /** Stop the scheduler. Clears all timers. */
  stop(): void;

  /** Force an immediate sync for a specific data source */
  syncNow(pluginId: string, dataSourceId: string): Promise<SyncResult>;

  /** Update the sync interval for a data source */
  setInterval(pluginId: string, dataSourceId: string, intervalMs: number): void;

  /** Get sync status for all data sources */
  getStatus(): SyncStatusMap;
}

interface SyncResult {
  pluginId: string;
  dataSourceId: string;
  itemsSynced: number;
  itemsCreated: number;
  itemsUpdated: number;
  duration: number;
  error?: string;
}

type SyncStatusMap = Record<string, {
  dataSourceId: string;
  pluginId: string;
  lastSyncAt: string | null;
  nextSyncAt: string;
  status: 'idle' | 'syncing' | 'error';
  error?: string;
  itemsSynced: number;
}>;
```

### 4.4 Incremental Sync with Cursors

Plugins implement incremental sync using cursors. The sync scheduler persists cursor state in the `plugin_sync_state` table so plugins resume from where they left off:

```typescript
interface PluginSyncHandler {
  /**
   * Perform a sync cycle.
   * @param cursor - The cursor from the last sync (null on first sync)
   * @param sdk - The plugin SDK with storeItems() etc.
   * @returns Updated cursor for next sync
   */
  sync(cursor: string | null, sdk: PluginDataSourceSDK): Promise<SyncHandlerResult>;
}

interface SyncHandlerResult {
  /** Updated cursor for next sync (e.g., timestamp, page token, ETag) */
  cursor: string;
  /** Number of items processed */
  itemCount: number;
  /** Whether there are more items to fetch (for pagination) */
  hasMore: boolean;
}
```

**Example: GitHub plugin sync handler**:

```typescript
devrig.activate(async (sdk) => {
  sdk.dataSources.register('github.notifications', {
    sync: async (cursor, dataSourceSdk) => {
      const token = await sdk.secrets.get('github_token');
      const since = cursor ?? new Date(Date.now() - 7 * 86400000).toISOString();

      const response = await sdk.http.fetch(
        `https://api.github.com/notifications?since=${since}&all=true`,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      const notifications = await response.json();

      await dataSourceSdk.storeItems(
        notifications.map((n: any) => ({
          externalId: n.id,
          type: n.subject.type.toLowerCase(),
          title: n.subject.title,
          sourceUrl: n.subject.url,
          priority: n.reason === 'review_requested' ? 'high' : 'normal',
          isActionable: n.reason === 'review_requested' || n.reason === 'assign',
          metadata: { reason: n.reason, repository: n.repository.full_name },
          externalCreatedAt: n.updated_at,
        }))
      );

      return {
        cursor: new Date().toISOString(),
        itemCount: notifications.length,
        hasMore: false,
      };
    },
  });
});
```

### 4.5 Sync State Tracking

The `plugin_sync_state` table (see Section 10) tracks the state of each plugin data source sync:

| Column | Purpose |
|--------|---------|
| `plugin_id` | Which plugin owns this sync state |
| `data_source_id` | Which data source within the plugin |
| `last_sync_at` | When the last successful sync completed |
| `sync_cursor` | Opaque cursor string (timestamp, page token, ETag, etc.) |
| `sync_status` | Current state: `idle`, `syncing`, `error` |
| `error` | Last error message (null on success) |
| `items_synced` | Cumulative count of items synced |

### 4.6 Sync Configuration

Users configure sync intervals per plugin data source via the settings UI:

```typescript
interface SyncConfig {
  /** Global minimum interval (prevents abuse). Default: 30000ms (30s) */
  globalMinIntervalMs: number;

  /** Per-data-source overrides */
  overrides: Record<string, {
    intervalMs: number;
    enabled: boolean;
    /** Quiet hours: pause sync during these times */
    quietHours?: { start: string; end: string; timezone: string };
  }>;

  /** Maximum concurrent syncs across all plugins. Default: 3 */
  maxConcurrentSyncs: number;

  /** Backoff on repeated failures */
  errorBackoff: {
    initialDelayMs: number;       // Default: 60000 (1 min)
    maxDelayMs: number;           // Default: 3600000 (1 hour)
    multiplier: number;           // Default: 2
  };
}
```

---

## 5. Automation Engine Architecture

### 5.1 Engine Core (Orchestrator)

The Engine Core is the top-level coordinator. It is a singleton instantiated once during app startup. Its responsibilities are:

- Maintaining the lifecycle of all subsystems (trigger manager, condition engine, action registry, job queue, worker pool).
- Receiving events from the Trigger Manager and resolving which workflows match.
- Creating workflow run records and enqueuing them.
- Providing a typed API surface for the Renderer Process (via IPC) and for plugins (via the Plugin SDK).

**Design Pattern**: The Engine Core follows a **Mediator pattern**. Subsystems do not communicate directly; they publish and subscribe through the Engine Core's internal event bus.

```typescript
// engine-core.ts -- Conceptual interface
interface EngineCore {
  // Lifecycle
  initialize(): Promise<void>;
  shutdown(): Promise<void>;

  // Workflow management
  registerWorkflow(workflow: WorkflowDefinition): Promise<string>;
  updateWorkflow(id: string, workflow: WorkflowDefinition): Promise<void>;
  deleteWorkflow(id: string): Promise<void>;
  getWorkflow(id: string): Promise<WorkflowDefinition | null>;

  // Execution
  triggerWorkflow(workflowId: string, context: TriggerContext): Promise<RunId>;
  cancelRun(runId: string): Promise<void>;
  getRunStatus(runId: string): Promise<RunStatus>;

  // Event bus
  on<T extends EngineEvent>(event: T, handler: EngineEventHandler<T>): Disposable;
  emit<T extends EngineEvent>(event: T, payload: EngineEventPayload<T>): void;
}
```

### 5.2 DAG Execution Model

Workflows are stored as **Directed Acyclic Graphs**. Each node in the graph is either an **Action Node** (performs work), a **Condition Node** (branches execution), or a **Junction Node** (merges parallel branches).

```typescript
interface WorkflowDefinition {
  id: string;
  version: number;
  name: string;
  description: string;
  trigger: TriggerConfig;
  entryConditions: ConditionExpression[];
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  settings: WorkflowSettings;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

interface WorkflowNode {
  id: string;
  type: 'action' | 'condition' | 'junction' | 'ai';
  actionType?: string;          // References ActionRegistry
  pluginId?: string;            // Which plugin provides this action
  config: Record<string, unknown>;
  position: { x: number; y: number }; // For UI rendering
  retryPolicy?: RetryPolicy;
  timeoutMs?: number;
}

interface WorkflowEdge {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  condition?: ConditionExpression; // For conditional branching
  label?: string;
}

interface WorkflowSettings {
  maxConcurrentRuns: number;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  errorHandling: 'stop' | 'skip' | 'retry';
  executionMode: 'sequential' | 'parallel'; // For independent branches
}
```

**DAG Execution Algorithm**:

1. Perform topological sort of the graph.
2. Identify independent branches (nodes with no mutual dependencies).
3. For `executionMode: 'parallel'`, execute independent branches concurrently.
4. At each node:
   a. Evaluate inbound edge conditions.
   b. If all required inbound edges are satisfied, execute the node.
   c. If the node is a Junction, wait for all inbound edges before proceeding.
   d. Store node output in the run context under `context.nodes[nodeId].output`.
   e. On failure, apply the node's retry policy, then the workflow's error handling strategy.

### 5.3 Workflow Versioning

Every modification to a workflow creates a new version. Active runs continue on the version they started with. New triggers use the latest version.

```
workflows table:        id | latest_version
workflow_versions table: id | workflow_id | version | definition_json | created_at
workflow_runs table:     id | workflow_id | version | status | ...
```

The **Expand-Contract** strategy applies to schema changes within workflow definitions. When the engine deserializes a definition, it normalizes it through a version migration chain:

```typescript
const WORKFLOW_SCHEMA_VERSION = 3;

function migrateDefinition(def: unknown, fromVersion: number): WorkflowDefinition {
  let current = def;
  if (fromVersion < 2) current = migrateV1toV2(current);
  if (fromVersion < 3) current = migrateV2toV3(current);
  return current as WorkflowDefinition;
}
```

---

## 6. Trigger System Design

### 6.1 Trigger Architecture

The Trigger Manager owns all trigger instances. It provides a unified interface regardless of trigger type.

```typescript
interface TriggerManager {
  register(config: TriggerConfig): Promise<string>;
  unregister(triggerId: string): void;
  pause(triggerId: string): void;
  resume(triggerId: string): void;
  getStatus(triggerId: string): TriggerStatus;
}

type TriggerConfig =
  | CronTriggerConfig
  | WebhookTriggerConfig
  | FileSystemTriggerConfig
  | PollingTriggerConfig
  | ManualTriggerConfig
  | EventTriggerConfig;  // Internal events from other workflows

interface TriggerStatus {
  id: string;
  type: string;
  state: 'active' | 'paused' | 'error';
  lastFiredAt: string | null;
  nextFireAt: string | null;  // For cron/polling
  fireCount: number;
  errorCount: number;
  lastError: string | null;
}
```

### 6.2 Trigger Types

> **Note**: In addition to the built-in trigger types below, plugins can register additional trigger types via the Plugin SDK (see Section 2.9 and Section 9.4). Plugin-registered triggers follow the same `TriggerConfig` / `TriggerHandler` interface and participate in the same deduplication and lifecycle management.

#### 6.2.1 Cron / Schedule Triggers

Uses `node-cron` for cron expression parsing and scheduling. Supports standard 5-field and extended 6-field (with seconds) cron expressions.

```typescript
interface CronTriggerConfig {
  type: 'cron';
  expression: string;           // e.g. '0 */15 * * *' (every 15 min)
  timezone?: string;            // e.g. 'America/New_York'
  maxExecutions?: number;       // Stop after N fires
  noOverlap?: boolean;          // Skip if previous run still active
}
```

**Implementation**: Each cron trigger registers a `node-cron` scheduled task. On fire, the task emits a `trigger:fired` event on the internal event bus with the trigger ID and a `TriggerContext` containing the scheduled time.

**Persistence**: Cron triggers are re-registered on app startup by reading the `triggers` table. The `last_fired_at` column prevents duplicate fires if the app restarts near a fire boundary.

#### 6.2.2 Webhook Triggers

A local HTTP server (using Fastify for speed) listens on a configurable port. Each webhook trigger gets a unique path.

```typescript
interface WebhookTriggerConfig {
  type: 'webhook';
  path?: string;                // Auto-generated if omitted: /hooks/<triggerId>
  method: 'GET' | 'POST' | 'PUT';
  secret?: string;              // HMAC validation
  tunnelEnabled?: boolean;      // Enable tunnel for external access
}
```

**Local Webhook Server**: Starts on-demand when the first webhook trigger is registered. Uses Fastify with:
- HMAC signature validation (when `secret` is set).
- Request body size limits (default 1MB).
- Rate limiting per path.

**Tunnel for External Access**: For receiving webhooks from external services (GitHub, Stripe), DevRig integrates with Cloudflare Tunnel (`cloudflared`) or localtunnel as a fallback. The tunnel is opt-in and clearly communicates the security implications to the user.

```typescript
interface TunnelManager {
  start(port: number): Promise<string>; // Returns public URL
  stop(): Promise<void>;
  getPublicUrl(): string | null;
  isRunning(): boolean;
}
```

#### 6.2.3 File System Triggers

Uses `chokidar` (v5) for cross-platform file system watching with native event support.

```typescript
interface FileSystemTriggerConfig {
  type: 'filesystem';
  paths: string[];              // Glob patterns supported
  events: ('add' | 'change' | 'unlink')[];
  debounceMs?: number;          // Default 300ms
  ignorePatterns?: string[];    // e.g. ['**/node_modules/**', '**/.git/**']
  followSymlinks?: boolean;
  depth?: number;               // Max directory depth
}
```

**Debouncing**: File system events are noisy. The trigger debounces events by file path, emitting only after `debounceMs` of silence for a given path. This prevents duplicate fires during file saves (which often produce multiple events).

#### 6.2.4 Polling Triggers

For APIs and data sources that do not support webhooks. The trigger periodically calls a configured endpoint or function and compares the result to the previous state.

```typescript
interface PollingTriggerConfig {
  type: 'polling';
  intervalMs: number;           // Minimum 5000 (5 seconds)
  source: PollingSource;
  deduplication: {
    strategy: 'hash' | 'field' | 'timestamp';
    field?: string;             // For 'field' strategy
  };
  maxRetries?: number;
}

type PollingSource =
  | { type: 'http'; url: string; method: string; headers?: Record<string, string>; body?: unknown }
  | { type: 'plugin'; pluginId: string; functionName: string; args?: unknown[] };
```

**Deduplication**: The trigger stores a hash (SHA-256) of the previous response. On each poll:
1. Fetch new data.
2. Compute hash of new data (or extract the deduplication field).
3. Compare with stored hash.
4. If different, fire the trigger with both old and new data in context.
5. Update stored hash.

This ensures only ~1.5% of polls produce actual workflow runs (matching industry observations from Zapier's data).

#### 6.2.5 Manual Triggers

Fired explicitly by the user through the UI or via the Plugin SDK.

```typescript
interface ManualTriggerConfig {
  type: 'manual';
  inputSchema?: ZodSchema;      // Optional schema for user-provided input
}
```

#### 6.2.6 Event Triggers (Internal)

Allows workflows to chain: one workflow's completion fires another.

```typescript
interface EventTriggerConfig {
  type: 'event';
  sourceWorkflowId: string;
  event: 'completed' | 'failed' | 'any';
  filter?: ConditionExpression; // Filter on the source run's output
}
```

### 6.3 Trigger Deduplication & Idempotency

All triggers produce a `TriggerEvent` that includes a deterministic `deduplicationKey`:

```typescript
interface TriggerEvent {
  id: string;                   // Unique event ID (cuid2)
  triggerId: string;
  workflowId: string;
  deduplicationKey: string;     // Deterministic based on trigger type + payload
  payload: unknown;
  firedAt: string;
}
```

Before enqueuing a workflow run, the Engine Core checks the `trigger_events` table for a matching `deduplicationKey` within a configurable window (default: 60 seconds). Duplicates are silently dropped and logged.

---

## 7. Condition Evaluation Engine

### 7.1 Expression Language

Conditions are expressed as a JSON-based DSL that supports logical operators, comparisons, and data access. The language is intentionally simple to remain serializable and version-safe.

```typescript
type ConditionExpression =
  | { type: 'and'; conditions: ConditionExpression[] }
  | { type: 'or'; conditions: ConditionExpression[] }
  | { type: 'not'; condition: ConditionExpression }
  | { type: 'compare'; left: ValueRef; operator: CompareOp; right: ValueRef }
  | { type: 'exists'; ref: ValueRef }
  | { type: 'matches'; ref: ValueRef; pattern: string }  // Regex
  | { type: 'in'; ref: ValueRef; values: unknown[] }
  | { type: 'custom'; pluginId: string; functionName: string; args: ValueRef[] };

type CompareOp = 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'contains' | 'startsWith' | 'endsWith';

type ValueRef =
  | { type: 'literal'; value: unknown }
  | { type: 'context'; path: string }     // e.g. 'trigger.payload.issue.status'
  | { type: 'env'; key: string }          // Environment variable
  | { type: 'node'; nodeId: string; path: string }  // Previous node's output
  | { type: 'secret'; key: string };      // From encrypted secrets store
```

### 7.2 Evaluation Engine

The condition evaluator is a pure function with no side effects:

```typescript
interface ConditionEngine {
  evaluate(
    expression: ConditionExpression,
    context: EvaluationContext
  ): boolean;

  validate(expression: ConditionExpression): ValidationResult;
}

interface EvaluationContext {
  trigger: { type: string; payload: unknown; firedAt: string };
  nodes: Record<string, { output: unknown; status: string }>;
  env: Record<string, string>;
  secrets: Record<string, string>;
  workflow: { id: string; name: string; version: number };
  run: { id: string; startedAt: string };
}
```

**Implementation Details**:
- **Safe property access**: Uses a lodash-style `get()` for deep path resolution with `undefined` as the default.
- **Type coercion**: Strict by default. Comparisons between mismatched types return `false` rather than coercing. Explicit type casting is available via a `cast` value ref type.
- **Regex safety**: Patterns are compiled once and cached. A timeout of 100ms is enforced per regex evaluation to prevent ReDoS.
- **Custom conditions**: Plugins can register custom condition functions. These execute in the plugin's sandbox with a 500ms timeout.

### 7.3 Validation

All condition expressions are validated at save time using Zod schemas:

```typescript
const conditionExpressionSchema: z.ZodType<ConditionExpression> = z.lazy(() =>
  z.discriminatedUnion('type', [
    z.object({ type: z.literal('and'), conditions: z.array(conditionExpressionSchema) }),
    z.object({ type: z.literal('or'), conditions: z.array(conditionExpressionSchema) }),
    z.object({ type: z.literal('not'), condition: conditionExpressionSchema }),
    z.object({
      type: z.literal('compare'),
      left: valueRefSchema,
      operator: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'contains', 'startsWith', 'endsWith']),
      right: valueRefSchema,
    }),
    // ... other variants
  ])
);
```

---

## 8. Action Execution Framework

### 8.1 Action Registry

> **Note**: In addition to built-in action types, plugins can register additional action executors via the Plugin SDK (see Section 2.6 and Section 9.4). Plugin-registered actions appear in the Action Registry alongside built-in actions and are available in the flow builder and inbox action menus.

The Action Registry is a catalog of all available action types. Built-in actions ship with the app; plugin actions are registered dynamically.

```typescript
interface ActionRegistry {
  register(descriptor: ActionDescriptor): void;
  unregister(actionType: string): void;
  get(actionType: string): ActionDescriptor | undefined;
  list(): ActionDescriptor[];
  listByCategory(category: string): ActionDescriptor[];
}

interface ActionDescriptor {
  type: string;                          // Unique identifier, e.g. 'http.request'
  name: string;                          // Human-readable name
  description: string;
  category: string;                      // 'http', 'file', 'ai', 'notification', etc.
  pluginId?: string;                     // null for built-in actions
  inputSchema: z.ZodSchema;             // Validated before execution
  outputSchema: z.ZodSchema;            // Contract for downstream nodes
  execute: ActionExecutor;
  estimatedDurationMs?: number;          // Hint for timeout calculation
}

type ActionExecutor = (
  input: unknown,
  context: ActionExecutionContext
) => Promise<ActionResult>;

interface ActionExecutionContext {
  runId: string;
  nodeId: string;
  workflowId: string;
  logger: Logger;                        // Scoped logger for this execution
  secrets: SecretsAccessor;              // Read-only access to user secrets
  signal: AbortSignal;                   // For cancellation
  emit: (event: string, data: unknown) => void; // Progress events
}

interface ActionResult {
  success: boolean;
  output: unknown;
  error?: { code: string; message: string; details?: unknown };
  metrics?: { durationMs: number; [key: string]: unknown };
}
```

### 8.2 Built-in Action Types

| Category | Action Type | Description |
|----------|------------|-------------|
| HTTP | `http.request` | Make HTTP requests (GET, POST, PUT, DELETE, PATCH) |
| HTTP | `http.graphql` | Execute GraphQL queries/mutations |
| File | `file.read` | Read file contents |
| File | `file.write` | Write/append to files |
| File | `file.transform` | Apply transformations (JSON, CSV, XML parsing) |
| Shell | `shell.exec` | Execute shell commands (sandboxed) |
| Data | `data.transform` | JSONPath, JMESPath, template rendering |
| Data | `data.filter` | Filter arrays/objects by conditions |
| Data | `data.aggregate` | Count, sum, average, group-by |
| Notification | `notify.desktop` | System notification via Electron |
| Notification | `notify.sound` | Play a sound |
| Flow | `flow.delay` | Pause execution for N ms |
| Flow | `flow.branch` | Conditional branching (if/else) |
| Flow | `flow.loop` | Iterate over arrays |
| Flow | `flow.parallel` | Execute multiple actions concurrently |
| AI | `ai.prompt` | Send prompt to Claude API |
| AI | `ai.code` | Execute via Claude Code CLI |
| AI | `ai.mcp` | Invoke MCP tool |
| Git | `git.status` | Get repository status |
| Git | `git.commit` | Stage and commit changes |
| Git | `git.diff` | Get diff output |

### 8.3 Action Execution Pipeline

Each action goes through a standardized pipeline:

```
1. Input Resolution
   - Resolve ValueRefs in the action config against the run context.
   - Interpolate template strings (e.g., "Hello {{trigger.payload.name}}").

2. Input Validation
   - Validate resolved input against the action's inputSchema (Zod).
   - Reject with a clear error if validation fails.

3. Pre-execution Hooks
   - Plugin pre-hooks (if registered).
   - Rate limiting check (per action type).
   - Resource limit check (memory, concurrent actions).

4. Execution
   - Call the ActionExecutor with resolved input and context.
   - Enforce timeout via AbortSignal.
   - Stream progress events to the run log.

5. Output Validation
   - Validate output against the action's outputSchema.
   - Log a warning (but do not fail) if output does not match.

6. Post-execution Hooks
   - Plugin post-hooks (if registered).
   - Metric recording.
   - Output storage in run context.

7. Error Handling
   - If execution throws or returns success: false,
     apply the retry policy (see Section 15).
```

### 8.4 Template Engine

Action configurations support a Handlebars-style template syntax for referencing dynamic data:

```typescript
// Template syntax examples:
"Hello {{trigger.payload.user.name}}"
"Status is {{nodes.check_status.output.code}}"
"{{#if (eq trigger.type 'webhook')}}Webhook{{else}}Other{{/if}}"
"Items: {{#each nodes.fetch_items.output.items}}{{this.name}}, {{/each}}"
```

Templates are compiled once at workflow save time and evaluated at runtime. The engine uses a lightweight custom template parser (not the full Handlebars library) to keep the dependency surface small.

---

## 9. Plugin SDK Design & API

### 9.1 Plugin Manifest (Legacy Format)

> **Note**: This section describes the original plugin manifest format focused on flow-builder triggers, actions, and conditions. For the expanded plugin manifest schema that includes data sources, AI pipelines, views, and flow nodes, see **Section 2.2**. The legacy format below remains supported; plugins using it are treated as flow-builder-only plugins.

Every plugin is an npm package with a `devrig-plugin.json` manifest (or a `devrig` key in `package.json`):

```json
{
  "name": "devrig-plugin-github",
  "version": "1.0.0",
  "displayName": "GitHub Integration",
  "description": "Triggers and actions for GitHub repositories",
  "author": "DevRig Community",
  "license": "MIT",
  "engine": ">=1.0.0",
  "main": "./dist/index.js",
  "permissions": [
    "network",
    "secrets:read"
  ],
  "triggers": [
    {
      "type": "github.push",
      "name": "Push Event",
      "configSchema": "./schemas/push-trigger.json"
    }
  ],
  "actions": [
    {
      "type": "github.create_issue",
      "name": "Create Issue",
      "category": "github",
      "inputSchema": "./schemas/create-issue-input.json",
      "outputSchema": "./schemas/create-issue-output.json"
    }
  ],
  "conditions": [
    {
      "type": "github.is_default_branch",
      "name": "Is Default Branch"
    }
  ],
  "settingsSchema": "./schemas/settings.json"
}
```

### 9.2 Plugin Lifecycle

```
Discovery --> Validation --> Installation --> Activation --> Running --> Deactivation --> Uninstallation

Discovery:
  - Scan configured plugin directories
  - Read package.json + devrig-plugin.json
  - Validate manifest against schema

Validation:
  - Check engine version compatibility
  - Verify required permissions are declared
  - Validate all referenced schemas exist and parse

Installation:
  - npm install in isolated directory (~/.devrig/plugins/<name>/)
  - Resolve dependencies
  - Store metadata in plugins table

Activation:
  - Load plugin entry point in isolated-vm sandbox (see 6.3)
  - Call plugin.activate(sdk) lifecycle hook
  - Register triggers, actions, conditions with their respective managers

Running:
  - Plugin code executes within the sandbox
  - All host access goes through the SDK proxy
  - Resource limits enforced (CPU time, memory)

Deactivation:
  - Call plugin.deactivate() lifecycle hook
  - Unregister all triggers, actions, conditions
  - Release sandbox resources

Uninstallation:
  - Deactivate if active
  - Remove plugin directory
  - Delete metadata from plugins table
  - Clean up any orphaned workflow references
```

### 9.3 Plugin Sandbox

Plugins execute inside `isolated-vm` V8 isolates with strict resource limits. This is the same isolation model used by Screeps (massively multiplayer) and Algolia (production crawlers).

```typescript
interface PluginSandbox {
  // Resource limits
  memoryLimitMb: number;        // Default: 128MB per plugin
  cpuTimeoutMs: number;         // Default: 5000ms per invocation
  wallTimeoutMs: number;        // Default: 30000ms per invocation

  // Exposed host functions (the plugin SDK surface)
  hostFunctions: {
    'sdk.log': (level: string, message: string, meta?: unknown) => void;
    'sdk.secrets.get': (key: string) => Promise<string | null>;
    'sdk.http.fetch': (url: string, options: FetchOptions) => Promise<FetchResponse>;
    'sdk.storage.get': (key: string) => Promise<unknown>;
    'sdk.storage.set': (key: string, value: unknown) => Promise<void>;
    'sdk.events.emit': (event: string, data: unknown) => void;
  };
}
```

**Why isolated-vm over Node.js vm module**: The built-in `vm` module provides no real security boundary. Researchers have repeatedly demonstrated sandbox escapes through prototype pollution and constructor access. `isolated-vm` uses V8's Isolate interface, which provides a genuine memory and execution boundary. Communication between the sandbox and host uses JSON serialization over IPC, preventing object reference leaks.

**Why not worker_threads for sandboxing**: Worker threads share the same V8 heap by default. While they run in separate threads, they do not provide a security boundary. `isolated-vm` provides both isolation and resource metering (CPU time, memory limits) that worker threads cannot.

### 9.4 Plugin SDK API

The SDK is injected into the plugin's sandbox as a global:

```typescript
// This is what plugin authors see and code against
declare global {
  const devrig: DevRigSDK;
}

interface DevRigSDK {
  // Plugin lifecycle
  activate(callback: (sdk: DevRigSDK) => void | Promise<void>): void;
  deactivate(callback: () => void | Promise<void>): void;

  // Trigger registration
  triggers: {
    register(type: string, handler: TriggerHandler): void;
    fire(triggerId: string, payload: unknown): void;
  };

  // Action registration
  actions: {
    register(type: string, executor: ActionExecutor): void;
  };

  // Condition registration
  conditions: {
    register(type: string, evaluator: ConditionEvaluator): void;
  };

  // Utilities
  log: Logger;
  secrets: SecretsAccessor;
  http: HttpClient;            // Sandboxed fetch with permission checks
  storage: PluginStorage;      // Per-plugin key-value storage (SQLite-backed)
  events: EventBus;            // Scoped event bus

  // Metadata
  version: string;
  pluginId: string;
}

// Example plugin implementation
devrig.activate(async (sdk) => {
  sdk.actions.register('github.create_issue', async (input, context) => {
    const token = await sdk.secrets.get('github_token');
    const response = await sdk.http.fetch(
      `https://api.github.com/repos/${input.owner}/${input.repo}/issues`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title: input.title, body: input.body }),
      }
    );
    return { success: true, output: response.json() };
  });
});
```

### 9.5 Hot Reload for Development

During plugin development, DevRig watches the plugin directory with chokidar. On file changes:

1. Deactivate the running plugin instance.
2. Destroy the current sandbox.
3. Reload the plugin entry point.
4. Re-create the sandbox and activate.

This provides a sub-second feedback loop for plugin developers. Hot reload is disabled by default in production; it is gated behind a `devMode` flag.

---

## 10. Database Schema (SQL DDL)

### 10.1 Technology Choice

- **Database**: SQLite via `better-sqlite3` (synchronous, fastest SQLite binding for Node.js)
- **ORM**: Drizzle ORM (TypeScript-first, zero-overhead, excellent SQLite support)
- **Mode**: WAL (Write-Ahead Logging) for concurrent reads during writes
- **Location**: `~/.devrig/data/devrig.db`
- **Migrations**: Drizzle Kit `generate` + custom app-startup migration runner

### 10.2 SQLite Configuration

Applied at database open:

```sql
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;
PRAGMA busy_timeout = 5000;
PRAGMA cache_size = -20000;          -- 20MB cache
PRAGMA wal_autocheckpoint = 1000;    -- Checkpoint every 1000 pages
PRAGMA mmap_size = 268435456;        -- 256MB memory-mapped I/O
```

### 10.3 Complete DDL

```sql
-- ============================================================
-- WORKFLOWS
-- ============================================================

CREATE TABLE workflows (
  id                TEXT PRIMARY KEY,               -- cuid2
  name              TEXT NOT NULL,
  description       TEXT DEFAULT '',
  latest_version    INTEGER NOT NULL DEFAULT 1,
  is_enabled        INTEGER NOT NULL DEFAULT 1,     -- boolean
  folder_id         TEXT REFERENCES folders(id) ON DELETE SET NULL,
  tags              TEXT DEFAULT '[]',              -- JSON array of strings
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_workflows_enabled ON workflows(is_enabled);
CREATE INDEX idx_workflows_folder ON workflows(folder_id);
CREATE INDEX idx_workflows_updated ON workflows(updated_at);

CREATE TABLE workflow_versions (
  id                TEXT PRIMARY KEY,               -- cuid2
  workflow_id       TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  version           INTEGER NOT NULL,
  definition        TEXT NOT NULL,                  -- JSON: WorkflowDefinition
  schema_version    INTEGER NOT NULL DEFAULT 1,     -- For definition format migrations
  change_summary    TEXT DEFAULT '',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(workflow_id, version)
);

CREATE INDEX idx_wv_workflow ON workflow_versions(workflow_id);
CREATE INDEX idx_wv_workflow_version ON workflow_versions(workflow_id, version);

-- ============================================================
-- TRIGGERS
-- ============================================================

CREATE TABLE triggers (
  id                TEXT PRIMARY KEY,               -- cuid2
  workflow_id       TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  type              TEXT NOT NULL,                  -- 'cron', 'webhook', 'filesystem', etc.
  config            TEXT NOT NULL,                  -- JSON: TriggerConfig
  state             TEXT NOT NULL DEFAULT 'active', -- 'active', 'paused', 'error'
  last_fired_at     TEXT,
  fire_count        INTEGER NOT NULL DEFAULT 0,
  error_count       INTEGER NOT NULL DEFAULT 0,
  last_error        TEXT,
  dedup_state       TEXT,                          -- JSON: deduplication state (hash, etc.)
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_triggers_workflow ON triggers(workflow_id);
CREATE INDEX idx_triggers_type ON triggers(type);
CREATE INDEX idx_triggers_state ON triggers(state);

CREATE TABLE trigger_events (
  id                TEXT PRIMARY KEY,               -- cuid2
  trigger_id        TEXT NOT NULL REFERENCES triggers(id) ON DELETE CASCADE,
  workflow_id       TEXT NOT NULL,
  dedup_key         TEXT NOT NULL,
  payload           TEXT,                          -- JSON
  fired_at          TEXT NOT NULL DEFAULT (datetime('now')),
  processed         INTEGER NOT NULL DEFAULT 0     -- boolean
);

CREATE INDEX idx_te_trigger ON trigger_events(trigger_id);
CREATE INDEX idx_te_dedup ON trigger_events(dedup_key, fired_at);
CREATE INDEX idx_te_processed ON trigger_events(processed);

-- ============================================================
-- WORKFLOW RUNS
-- ============================================================

CREATE TABLE workflow_runs (
  id                TEXT PRIMARY KEY,               -- cuid2
  workflow_id       TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  workflow_version  INTEGER NOT NULL,
  trigger_event_id  TEXT REFERENCES trigger_events(id) ON DELETE SET NULL,
  status            TEXT NOT NULL DEFAULT 'pending',-- 'pending','running','completed','failed','cancelled','timed_out'
  context           TEXT DEFAULT '{}',              -- JSON: runtime context (trigger payload, node outputs)
  error             TEXT,                           -- JSON: error details if failed
  started_at        TEXT,
  completed_at      TEXT,
  duration_ms       INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_wr_workflow ON workflow_runs(workflow_id);
CREATE INDEX idx_wr_status ON workflow_runs(status);
CREATE INDEX idx_wr_created ON workflow_runs(created_at);
CREATE INDEX idx_wr_workflow_status ON workflow_runs(workflow_id, status);

CREATE TABLE node_runs (
  id                TEXT PRIMARY KEY,               -- cuid2
  run_id            TEXT NOT NULL REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id           TEXT NOT NULL,                  -- References node within workflow definition
  action_type       TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'pending',-- 'pending','running','completed','failed','skipped'
  input             TEXT,                           -- JSON: resolved input
  output            TEXT,                           -- JSON: action output
  error             TEXT,                           -- JSON: error details
  attempt           INTEGER NOT NULL DEFAULT 1,
  started_at        TEXT,
  completed_at      TEXT,
  duration_ms       INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_nr_run ON node_runs(run_id);
CREATE INDEX idx_nr_status ON node_runs(status);
CREATE INDEX idx_nr_run_node ON node_runs(run_id, node_id);

-- ============================================================
-- PLUGINS
-- ============================================================

CREATE TABLE plugins (
  id                TEXT PRIMARY KEY,               -- cuid2
  name              TEXT NOT NULL UNIQUE,           -- npm package name
  version           TEXT NOT NULL,
  display_name      TEXT NOT NULL,
  description       TEXT DEFAULT '',
  author            TEXT DEFAULT '',
  state             TEXT NOT NULL DEFAULT 'installed', -- 'installed','active','error','disabled'
  permissions       TEXT DEFAULT '[]',              -- JSON array of permission strings
  settings          TEXT DEFAULT '{}',              -- JSON: user-configured plugin settings
  install_path      TEXT NOT NULL,                  -- Absolute path to plugin directory
  manifest          TEXT NOT NULL,                  -- JSON: full plugin manifest
  error_message     TEXT,
  installed_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_plugins_name ON plugins(name);
CREATE INDEX idx_plugins_state ON plugins(state);

CREATE TABLE plugin_storage (
  id                TEXT PRIMARY KEY,               -- cuid2
  plugin_id         TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  key               TEXT NOT NULL,
  value             TEXT,                           -- JSON
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(plugin_id, key)
);

CREATE INDEX idx_ps_plugin_key ON plugin_storage(plugin_id, key);

-- ============================================================
-- SECRETS
-- ============================================================

CREATE TABLE secrets (
  id                TEXT PRIMARY KEY,               -- cuid2
  name              TEXT NOT NULL UNIQUE,           -- User-friendly key name
  encrypted_value   TEXT NOT NULL,                  -- AES-256-GCM encrypted
  iv                TEXT NOT NULL,                  -- Initialization vector
  auth_tag          TEXT NOT NULL,                  -- GCM authentication tag
  category          TEXT DEFAULT 'general',
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_secrets_name ON secrets(name);

-- ============================================================
-- JOB QUEUE
-- ============================================================

CREATE TABLE job_queue (
  id                TEXT PRIMARY KEY,               -- cuid2
  type              TEXT NOT NULL,                  -- 'workflow_run', 'action_exec', etc.
  payload           TEXT NOT NULL,                  -- JSON: job-specific data
  priority          INTEGER NOT NULL DEFAULT 0,     -- Higher = more urgent
  status            TEXT NOT NULL DEFAULT 'pending',-- 'pending','processing','completed','failed','dead'
  attempts          INTEGER NOT NULL DEFAULT 0,
  max_attempts      INTEGER NOT NULL DEFAULT 3,
  next_retry_at     TEXT,
  locked_by         TEXT,                           -- Worker thread ID
  locked_at         TEXT,
  error             TEXT,                           -- JSON: last error
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at      TEXT
);

CREATE INDEX idx_jq_status_priority ON job_queue(status, priority DESC, created_at);
CREATE INDEX idx_jq_type ON job_queue(type);
CREATE INDEX idx_jq_locked ON job_queue(locked_by);
CREATE INDEX idx_jq_retry ON job_queue(status, next_retry_at);

-- ============================================================
-- LOGS
-- ============================================================

CREATE TABLE execution_logs (
  id                TEXT PRIMARY KEY,               -- cuid2
  run_id            TEXT REFERENCES workflow_runs(id) ON DELETE CASCADE,
  node_id           TEXT,                           -- Null for workflow-level logs
  level             TEXT NOT NULL,                  -- 'debug','info','warn','error'
  message           TEXT NOT NULL,
  metadata          TEXT,                           -- JSON: structured data
  timestamp         TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_el_run ON execution_logs(run_id);
CREATE INDEX idx_el_level ON execution_logs(level);
CREATE INDEX idx_el_timestamp ON execution_logs(timestamp);
CREATE INDEX idx_el_run_node ON execution_logs(run_id, node_id);

-- ============================================================
-- AI USAGE TRACKING
-- ============================================================

CREATE TABLE ai_usage (
  id                TEXT PRIMARY KEY,               -- cuid2
  run_id            TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  node_id           TEXT,
  provider          TEXT NOT NULL,                  -- 'anthropic', 'claude_code'
  model             TEXT NOT NULL,                  -- 'claude-sonnet-4-20250514', etc.
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  cache_read_tokens INTEGER NOT NULL DEFAULT 0,
  cache_write_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL DEFAULT 0.0,
  duration_ms       INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_ai_run ON ai_usage(run_id);
CREATE INDEX idx_ai_created ON ai_usage(created_at);
CREATE INDEX idx_ai_provider ON ai_usage(provider);

-- ============================================================
-- FOLDERS (Organizational)
-- ============================================================

CREATE TABLE folders (
  id                TEXT PRIMARY KEY,               -- cuid2
  name              TEXT NOT NULL,
  parent_id         TEXT REFERENCES folders(id) ON DELETE CASCADE,
  sort_order        INTEGER NOT NULL DEFAULT 0,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_folders_parent ON folders(parent_id);

-- ============================================================
-- SYNC METADATA (Future-Ready)
-- ============================================================

CREATE TABLE sync_metadata (
  id                TEXT PRIMARY KEY,               -- cuid2
  table_name        TEXT NOT NULL,
  row_id            TEXT NOT NULL,
  local_version     INTEGER NOT NULL DEFAULT 1,     -- Lamport timestamp
  server_version    INTEGER,
  last_synced_at    TEXT,
  sync_state        TEXT DEFAULT 'pending',         -- 'pending','synced','conflict'
  UNIQUE(table_name, row_id)
);

CREATE INDEX idx_sync_state ON sync_metadata(sync_state);
CREATE INDEX idx_sync_table ON sync_metadata(table_name);

-- ============================================================
-- APP SETTINGS
-- ============================================================

CREATE TABLE app_settings (
  key               TEXT PRIMARY KEY,
  value             TEXT NOT NULL,                  -- JSON
  updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================
-- UNIFIED INBOX (Plugin Data Aggregation)
-- ============================================================

CREATE TABLE inbox_items (
  id                TEXT PRIMARY KEY,               -- cuid2
  plugin_id         TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  external_id       TEXT NOT NULL,                  -- Unique within plugin (e.g., GitHub notification ID)
  type              TEXT NOT NULL,                  -- Plugin-scoped type (e.g., 'pull_request', 'issue')
  title             TEXT NOT NULL,
  body              TEXT,                           -- Full content (markdown)
  preview           TEXT,                           -- Short preview (max 280 chars)
  source_url        TEXT,                           -- URL to open in browser
  priority          TEXT DEFAULT 'normal',          -- 'urgent', 'high', 'normal', 'low'
  status            TEXT NOT NULL DEFAULT 'unread', -- 'unread', 'read', 'archived', 'snoozed'
  ai_classification TEXT,                           -- JSON: { category, confidence, reasoning }
  ai_summary        TEXT,                           -- AI-generated summary
  ai_draft          TEXT,                           -- AI-generated draft response
  metadata          TEXT DEFAULT '{}',              -- JSON: plugin-specific structured data
  is_actionable     INTEGER NOT NULL DEFAULT 0,     -- boolean: requires user action
  snoozed_until     TEXT,                           -- Snooze expiry timestamp
  external_created_at TEXT,                         -- When item was created in source system
  synced_at         TEXT NOT NULL DEFAULT (datetime('now')),
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(plugin_id, external_id)
);

CREATE INDEX idx_inbox_plugin ON inbox_items(plugin_id);
CREATE INDEX idx_inbox_status ON inbox_items(status);
CREATE INDEX idx_inbox_priority ON inbox_items(priority);
CREATE INDEX idx_inbox_type ON inbox_items(plugin_id, type);
CREATE INDEX idx_inbox_actionable ON inbox_items(is_actionable, status);
CREATE INDEX idx_inbox_snoozed ON inbox_items(status, snoozed_until);
CREATE INDEX idx_inbox_updated ON inbox_items(updated_at);
CREATE INDEX idx_inbox_created ON inbox_items(created_at);
CREATE INDEX idx_inbox_external ON inbox_items(plugin_id, external_id);

-- Full-text search on inbox items
CREATE VIRTUAL TABLE inbox_items_fts USING fts5(
  title,
  body,
  preview,
  content='inbox_items',
  content_rowid='rowid'
);

-- Triggers to keep FTS index in sync
CREATE TRIGGER inbox_items_ai AFTER INSERT ON inbox_items BEGIN
  INSERT INTO inbox_items_fts(rowid, title, body, preview)
  VALUES (NEW.rowid, NEW.title, NEW.body, NEW.preview);
END;

CREATE TRIGGER inbox_items_ad AFTER DELETE ON inbox_items BEGIN
  INSERT INTO inbox_items_fts(inbox_items_fts, rowid, title, body, preview)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.body, OLD.preview);
END;

CREATE TRIGGER inbox_items_au AFTER UPDATE ON inbox_items BEGIN
  INSERT INTO inbox_items_fts(inbox_items_fts, rowid, title, body, preview)
  VALUES ('delete', OLD.rowid, OLD.title, OLD.body, OLD.preview);
  INSERT INTO inbox_items_fts(rowid, title, body, preview)
  VALUES (NEW.rowid, NEW.title, NEW.body, NEW.preview);
END;

-- ============================================================
-- PLUGIN SYNC STATE
-- ============================================================

CREATE TABLE plugin_sync_state (
  plugin_id         TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
  data_source_id    TEXT NOT NULL,                  -- Data source ID within the plugin
  last_sync_at      TEXT,                           -- When last successful sync completed
  sync_cursor       TEXT,                           -- Opaque cursor (timestamp, page token, ETag)
  sync_status       TEXT NOT NULL DEFAULT 'idle',   -- 'idle', 'syncing', 'error'
  error             TEXT,                           -- Last error message (null on success)
  items_synced      INTEGER NOT NULL DEFAULT 0,     -- Cumulative items synced
  created_at        TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (plugin_id, data_source_id)
);

CREATE INDEX idx_pss_status ON plugin_sync_state(sync_status);
CREATE INDEX idx_pss_plugin ON plugin_sync_state(plugin_id);

-- ============================================================
-- AI OPERATIONS (Unified Cost Tracking)
-- ============================================================

CREATE TABLE ai_operations (
  id                TEXT PRIMARY KEY,               -- cuid2
  provider          TEXT NOT NULL,                  -- 'anthropic', 'openai', 'ollama', etc.
  model             TEXT NOT NULL,                  -- 'claude-sonnet-4-20250514', 'gpt-4o', etc.
  operation         TEXT NOT NULL,                  -- 'complete', 'stream', 'classify', 'summarize', 'draft'
  plugin_id         TEXT REFERENCES plugins(id) ON DELETE SET NULL,
  pipeline_id       TEXT,                           -- AI pipeline that triggered this operation
  inbox_item_id     TEXT REFERENCES inbox_items(id) ON DELETE SET NULL,
  run_id            TEXT REFERENCES workflow_runs(id) ON DELETE SET NULL,
  input_tokens      INTEGER NOT NULL DEFAULT 0,
  output_tokens     INTEGER NOT NULL DEFAULT 0,
  cost_usd          REAL NOT NULL DEFAULT 0.0,
  duration_ms       INTEGER,
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_aiops_provider ON ai_operations(provider);
CREATE INDEX idx_aiops_plugin ON ai_operations(plugin_id);
CREATE INDEX idx_aiops_pipeline ON ai_operations(pipeline_id);
CREATE INDEX idx_aiops_created ON ai_operations(created_at);
CREATE INDEX idx_aiops_operation ON ai_operations(operation);
CREATE INDEX idx_aiops_item ON ai_operations(inbox_item_id);
```

### 10.4 Migration Strategy

Drizzle Kit generates SQL migration files. A custom migration runner executes them at app startup:

```typescript
// migration-runner.ts
async function runMigrations(db: BetterSqlite3.Database): Promise<void> {
  // 1. Read current schema version from user_version pragma
  const { user_version } = db.pragma('user_version', { simple: true });

  // 2. Load migration files sorted by version number
  const migrations = loadMigrationFiles(); // From embedded resources

  // 3. Apply pending migrations in a transaction
  for (const migration of migrations) {
    if (migration.version > user_version) {
      db.transaction(() => {
        db.exec(migration.sql);
        db.pragma(`user_version = ${migration.version}`);
      })();
      logger.info(`Applied migration v${migration.version}: ${migration.name}`);
    }
  }
}
```

**Key Design Decisions**:
- Migrations are embedded into the app binary at build time (not read from disk at runtime).
- Each migration is idempotent (uses `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` where possible).
- Before running migrations, the engine creates a backup of the database file.
- SQLite's `user_version` PRAGMA tracks the current schema version without requiring a separate migrations table.

---

## 11. Worker / Job Queue Architecture

### 11.1 Job Queue (SQLite-Backed, No External Dependencies)

The job queue is implemented directly on top of SQLite. This avoids any dependency on Redis or other external services while providing persistence and crash recovery.

```typescript
interface JobQueue {
  enqueue(job: JobDefinition): Promise<string>;
  dequeue(workerIds: string[], batchSize?: number): Promise<Job[]>;
  complete(jobId: string, result: unknown): Promise<void>;
  fail(jobId: string, error: unknown): Promise<void>;
  retry(jobId: string): Promise<void>;
  cancel(jobId: string): Promise<void>;

  // Maintenance
  cleanCompleted(olderThanMs: number): Promise<number>;
  recoverStale(staleLockMs: number): Promise<number>;
  getStats(): Promise<QueueStats>;
}

interface JobDefinition {
  type: string;
  payload: unknown;
  priority?: number;            // Default: 0
  maxAttempts?: number;         // Default: 3
  delayMs?: number;             // Delay before first execution
}
```

**Dequeue Algorithm** (atomic, using SQLite's deterministic locking):

```sql
UPDATE job_queue
SET status = 'processing',
    locked_by = :workerId,
    locked_at = datetime('now'),
    attempts = attempts + 1
WHERE id = (
  SELECT id FROM job_queue
  WHERE status = 'pending'
    AND (next_retry_at IS NULL OR next_retry_at <= datetime('now'))
  ORDER BY priority DESC, created_at ASC
  LIMIT 1
)
RETURNING *;
```

This uses SQLite's implicit row-level locking in WAL mode to ensure exactly-once delivery within a single process.

**Stale Lock Recovery**: A maintenance task runs every 60 seconds, resetting jobs whose `locked_at` exceeds the timeout (default 5 minutes) back to `pending`.

### 11.2 Worker Thread Pool

Worker threads execute the actual workflow DAG. The pool scales between a minimum and maximum thread count based on queue depth.

```typescript
interface WorkerPool {
  initialize(config: WorkerPoolConfig): Promise<void>;
  shutdown(): Promise<void>;
  getStats(): WorkerPoolStats;
}

interface WorkerPoolConfig {
  minThreads: number;           // Default: 2
  maxThreads: number;           // Default: CPU cores - 1 (min 2)
  idleTimeoutMs: number;        // Terminate idle threads after this. Default: 30000
  taskTimeoutMs: number;        // Per-task timeout. Default: 300000 (5 min)
}
```

**Thread Communication**: Uses Node.js `worker_threads` with `MessagePort` for structured message passing. Each worker receives a job, executes it, and returns the result. The worker has access to a read-only snapshot of the database connection for reading workflow definitions and previous node outputs.

**Architecture**:

```
Main Thread
  |
  +-- WorkerPool Manager
       |
       +-- Worker Thread 1  <-- Executes Job A (DAG traversal + actions)
       |
       +-- Worker Thread 2  <-- Executes Job B
       |
       +-- Worker Thread N  <-- (spawned on demand, up to maxThreads)
```

**Each Worker Thread**:
1. Receives a job payload via `MessagePort`.
2. Deserializes the workflow definition.
3. Performs topological sort of the DAG.
4. Executes nodes sequentially (or parallel branches concurrently using `Promise.all` within the thread).
5. For each action execution, calls back to the main thread for sandboxed plugin execution (via `parentPort`).
6. Reports progress, completion, or failure back to the main thread.
7. Returns to idle state, waiting for the next job.

### 11.3 Concurrency Control

The `p-queue` library provides in-memory concurrency limiting for operations within a worker thread (e.g., limiting concurrent HTTP requests within a single workflow run):

```typescript
import PQueue from 'p-queue';

const actionQueue = new PQueue({
  concurrency: 5,              // Max 5 concurrent actions per worker
  timeout: 30000,              // 30s per action
  throwOnTimeout: true,
});
```

At the workflow level, `maxConcurrentRuns` is enforced by the Engine Core before enqueuing. It counts active runs for the workflow in the `workflow_runs` table and rejects or queues new runs if the limit is reached.

---

## 12. Legacy AI Integration Layer

> **Note**: This section describes the flow-builder-specific AI integration (Claude API, Claude Code CLI, MCP). For the new unified AI Provider Layer that powers the entire application (inbox AI pipelines, model routing, cost tracking), see **Section 3**. The implementations below remain valid and are used by the flow builder's `ai.prompt`, `ai.code`, and `ai.mcp` action types.

### 12.1 Architecture

The AI Integration Layer provides three integration paths, each suited to different use cases:

```
+----------------------------------------------------------+
|                   AI Integration Layer                    |
|                                                          |
|  +----------------+  +----------------+  +-----------+   |
|  | Claude API     |  | Claude Code    |  | MCP       |   |
|  | (Direct SDK)   |  | (CLI/Agent SDK)|  | (Protocol)|   |
|  +-------+--------+  +--------+-------+  +-----+-----+  |
|          |                     |               |          |
|  +-------v---------+  +-------v--------+  +---v-------+  |
|  | Prompt Template  |  | Process Spawn  |  | MCP Client|  |
|  | Engine           |  | Manager        |  | Manager   |  |
|  +-------+----------+ +-------+--------+  +---+-------+  |
|          |                     |               |          |
|  +-------v---------------------------------------------+ |
|  |              Token / Cost Tracker                    | |
|  +-----------------------------------------------------+ |
+----------------------------------------------------------+
```

### 12.2 Claude API Integration (Direct SDK)

For structured tasks: summarization, classification, data extraction, code generation.

```typescript
import Anthropic from '@anthropic-ai/sdk';

interface ClaudeAPIConfig {
  apiKey: string;                       // From secrets store
  model: string;                        // Default: 'claude-sonnet-4-20250514'
  maxTokens: number;                    // Default: 4096
  temperature: number;                  // Default: 0
  systemPrompt?: string;
}

interface AIPromptAction {
  type: 'ai.prompt';
  config: {
    templateId?: string;                // Reference to saved prompt template
    systemPrompt?: string;              // Inline system prompt
    userPrompt: string;                 // Template with {{variable}} interpolation
    model?: string;
    maxTokens?: number;
    temperature?: number;
    responseFormat?: 'text' | 'json';
    jsonSchema?: object;                // For structured output
    tools?: ToolDefinition[];           // For tool use
    stream?: boolean;                   // Stream response to logs
  };
}
```

**Implementation**:

```typescript
class ClaudeAPIClient {
  private client: Anthropic;
  private costTracker: CostTracker;

  async execute(config: AIPromptAction['config'], context: ActionExecutionContext): Promise<ActionResult> {
    const resolvedPrompt = this.templateEngine.render(config.userPrompt, context);

    const params: Anthropic.MessageCreateParams = {
      model: config.model ?? 'claude-sonnet-4-20250514',
      max_tokens: config.maxTokens ?? 4096,
      temperature: config.temperature ?? 0,
      system: config.systemPrompt,
      messages: [{ role: 'user', content: resolvedPrompt }],
    };

    if (config.stream) {
      return this.executeStreaming(params, context);
    }

    const response = await this.client.messages.create(params);

    // Track usage
    this.costTracker.record({
      runId: context.runId,
      nodeId: context.nodeId,
      provider: 'anthropic',
      model: params.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      cacheWriteTokens: response.usage.cache_creation_input_tokens ?? 0,
    });

    const content = response.content[0];
    const output = content.type === 'text' ? content.text : content;

    return {
      success: true,
      output: config.responseFormat === 'json' ? JSON.parse(output as string) : output,
      metrics: {
        durationMs: Date.now() - startTime,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      },
    };
  }

  private async executeStreaming(
    params: Anthropic.MessageCreateParams,
    context: ActionExecutionContext
  ): Promise<ActionResult> {
    let fullText = '';
    const stream = this.client.messages.stream(params);

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        fullText += event.delta.text;
        context.emit('ai:token', { text: event.delta.text });
      }
    }

    const finalMessage = await stream.finalMessage();
    this.costTracker.record({ /* ... */ });

    return { success: true, output: fullText };
  }
}
```

### 12.3 Claude Code CLI Integration

For complex, multi-step coding tasks that benefit from Claude Code's agentic capabilities (file editing, terminal commands, multi-file reasoning).

```typescript
interface AICodeAction {
  type: 'ai.code';
  config: {
    prompt: string;                     // Task description with template interpolation
    workingDirectory: string;           // CWD for Claude Code
    allowedTools?: string[];            // Restrict available tools
    maxTurns?: number;                  // Limit agent turns. Default: 10
    model?: string;                     // Override model
    permissionMode?: 'ask' | 'auto';   // Default: 'auto' for automation
    timeout?: number;                   // Ms. Default: 300000 (5 min)
  };
}
```

**Implementation using the Claude Agent SDK**:

```typescript
import { claude } from '@anthropic-ai/claude-code';

class ClaudeCodeClient {
  async execute(config: AICodeAction['config'], context: ActionExecutionContext): Promise<ActionResult> {
    const resolvedPrompt = this.templateEngine.render(config.prompt, context);

    const result = await claude({
      prompt: resolvedPrompt,
      options: {
        maxTurns: config.maxTurns ?? 10,
        model: config.model,
        cwd: config.workingDirectory,
        allowedTools: config.allowedTools,
        permissionMode: config.permissionMode ?? 'auto',
      },
      signal: context.signal,
    });

    // Track usage from result metadata
    if (result.usage) {
      this.costTracker.record({
        runId: context.runId,
        nodeId: context.nodeId,
        provider: 'claude_code',
        model: result.model ?? 'unknown',
        inputTokens: result.usage.inputTokens ?? 0,
        outputTokens: result.usage.outputTokens ?? 0,
        cacheReadTokens: result.usage.cacheReadInputTokens ?? 0,
        cacheWriteTokens: result.usage.cacheCreationInputTokens ?? 0,
        costUsd: result.usage.costUSD ?? 0,
      });
    }

    return {
      success: true,
      output: {
        result: result.output,
        filesModified: result.filesModified ?? [],
        commandsRun: result.commandsRun ?? [],
      },
    };
  }
}
```

### 12.4 MCP (Model Context Protocol) Integration

DevRig acts as both an MCP client (consuming tools from MCP servers) and optionally as an MCP server (exposing its own capabilities to AI tools).

**As MCP Client** (consuming external tools):

```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

interface MCPServerConfig {
  name: string;
  command: string;                      // e.g. 'npx', 'node'
  args: string[];                       // e.g. ['-y', '@modelcontextprotocol/server-filesystem']
  env?: Record<string, string>;
}

class MCPClientManager {
  private clients: Map<string, Client> = new Map();

  async connect(config: MCPServerConfig): Promise<void> {
    const transport = new StdioClientTransport({
      command: config.command,
      args: config.args,
      env: config.env,
    });

    const client = new Client(
      { name: 'devrig', version: '1.0.0' },
      { capabilities: {} }
    );

    await client.connect(transport);
    this.clients.set(config.name, client);
  }

  async callTool(serverName: string, toolName: string, args: unknown): Promise<unknown> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP server '${serverName}' not connected`);
    return client.callTool({ name: toolName, arguments: args as Record<string, unknown> });
  }

  async listTools(serverName: string): Promise<ToolDefinition[]> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP server '${serverName}' not connected`);
    const result = await client.listTools();
    return result.tools;
  }
}
```

**As MCP Server** (exposing DevRig capabilities to Claude):

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/index.js';

class DevRigMCPServer {
  private server: McpServer;

  constructor(engine: EngineCore) {
    this.server = new McpServer({
      name: 'devrig',
      version: '1.0.0',
    });

    // Expose workflow management tools
    this.server.tool('list_workflows', {}, async () => {
      const workflows = await engine.listWorkflows();
      return { content: [{ type: 'text', text: JSON.stringify(workflows) }] };
    });

    this.server.tool('trigger_workflow', {
      workflowId: { type: 'string', description: 'Workflow ID to trigger' },
      input: { type: 'object', description: 'Input data for the trigger' },
    }, async (args) => {
      const runId = await engine.triggerWorkflow(args.workflowId, {
        type: 'manual',
        payload: args.input,
        firedAt: new Date().toISOString(),
      });
      return { content: [{ type: 'text', text: `Run started: ${runId}` }] };
    });

    this.server.tool('get_run_status', {
      runId: { type: 'string' },
    }, async (args) => {
      const status = await engine.getRunStatus(args.runId);
      return { content: [{ type: 'text', text: JSON.stringify(status) }] };
    });
  }
}
```

### 12.5 Prompt Template Engine

```typescript
interface PromptTemplate {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  userPrompt: string;                   // Supports {{variable}} interpolation
  variables: PromptVariable[];
  model?: string;
  maxTokens?: number;
  temperature?: number;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

interface PromptVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'json';
  description: string;
  required: boolean;
  default?: unknown;
}
```

Templates are stored in a `prompt_templates` table (add to DDL above) and referenced by ID in workflow action configs. This allows prompt iteration without modifying workflows.

### 12.6 Cost Tracking

All AI usage is tracked in the `ai_usage` table. The cost tracker computes USD cost based on per-model pricing:

```typescript
const MODEL_PRICING: Record<string, { inputPer1k: number; outputPer1k: number }> = {
  'claude-sonnet-4-20250514': { inputPer1k: 0.003, outputPer1k: 0.015 },
  'claude-opus-4-20250514':   { inputPer1k: 0.015, outputPer1k: 0.075 },
  'claude-haiku-3-20250307':  { inputPer1k: 0.00025, outputPer1k: 0.00125 },
};

class CostTracker {
  record(usage: AIUsageRecord): void {
    const pricing = MODEL_PRICING[usage.model];
    const cost = pricing
      ? (usage.inputTokens / 1000) * pricing.inputPer1k +
        (usage.outputTokens / 1000) * pricing.outputPer1k
      : 0;

    this.db.insert(aiUsageTable).values({ ...usage, costUsd: cost });
  }

  async getTotalCost(period: { from: string; to: string }): Promise<number> {
    // Aggregate from ai_usage table
  }

  async getCostByWorkflow(workflowId: string): Promise<number> {
    // Aggregate by workflow
  }
}
```

Users can set **budget alerts** (stored in `app_settings`) that pause AI-enabled workflows when cumulative cost exceeds a threshold.

---

## 13. Cloud Sync Design (Future-Ready)

### 13.1 Sync Philosophy

DevRig follows Linear's approach: the local database is the source of truth. The server is a relay and persistence layer, not the authority. This means:

1. All operations are instant (local writes).
2. The app works fully offline.
3. Sync happens in the background.
4. Conflicts are rare and resolved with Last-Write-Wins (LWW) for most fields.

### 13.2 Sync Architecture

```
+-------------------+          +-------------------+          +-------------------+
| Client A          |          |   Sync Server     |          | Client B          |
|                   |          |                   |          |                   |
| SQLite            |  HTTPS   | PostgreSQL        |  HTTPS   | SQLite            |
| (local truth)     +--------->| (relay + persist) |<---------+ (local truth)     |
|                   |  WS      |                   |  WS      |                   |
| Sync Engine       |<---------+ Sync Engine       +--------->| Sync Engine       |
+-------------------+          +-------------------+          +-------------------+
```

### 13.3 Sync Protocol

Based on research into Linear's architecture and general local-first patterns:

**Lamport Timestamps**: Each mutation increments a local version counter (Lamport clock). The server maintains a global version counter. On sync, the server assigns a global ordering.

**Operation Log**: Instead of syncing row snapshots, DevRig syncs **operations** (mutations):

```typescript
interface SyncOperation {
  id: string;                           // cuid2
  clientId: string;                     // Unique per device
  localVersion: number;                 // Lamport timestamp
  serverVersion?: number;               // Assigned by server
  tableName: string;
  rowId: string;
  operationType: 'insert' | 'update' | 'delete';
  changes: Record<string, { old: unknown; new: unknown }>;
  timestamp: string;                    // ISO 8601
}
```

**Sync Flow**:

1. **Client writes locally**: Insert/update row, increment local version, write sync operation to `sync_operations` (local table).
2. **Push**: Client sends unsynced operations to server (batch, ordered by local version).
3. **Server processes**: Assigns server versions, resolves conflicts (LWW by timestamp), stores operations, broadcasts to other clients.
4. **Pull**: Client receives operations from server with server versions > last known server version. Applies them to local SQLite.
5. **Acknowledge**: Client marks operations as synced.

**Conflict Resolution**:

| Field Type | Strategy |
|-----------|----------|
| Workflow name, description | LWW (Last-Write-Wins by timestamp) |
| Workflow definition JSON | LWW (entire definition replaced) |
| Node positions (UI) | LWW per node |
| Run data | No conflict (runs are immutable after creation) |
| Settings | LWW per key |
| Rich text / Notes | CRDT via Yjs (future, for collaborative editing) |

### 13.4 Cloud API (Future)

```
POST   /api/v1/sync/push          -- Push local operations
GET    /api/v1/sync/pull           -- Pull remote operations since version
POST   /api/v1/teams               -- Create team
POST   /api/v1/teams/:id/members   -- Add member
GET    /api/v1/teams/:id/workflows -- List shared workflows
POST   /api/v1/auth/login          -- Authentication
POST   /api/v1/auth/refresh        -- Token refresh
```

### 13.5 Team Sharing Model

```
Team
  |-- Members (with roles: owner, admin, member, viewer)
  |-- Shared Workflows (with permissions: edit, run, view)
  |-- Shared Secrets (encrypted per-team key, never in plaintext)
  |-- Usage Quotas
```

The `sync_metadata` table in the DDL above is the foundation for this. It tracks per-row sync state without coupling the core schema to sync logic.

---

## 14. Logging & Observability

### 14.1 Logging Architecture

```
+-------------------+     +------------------+     +------------------+
| Application Code  | --> | Pino Logger      | --> | Transport: File  |
| (Engine, Actions, |     | (JSON, async)    |     | (rotating logs)  |
|  Plugins, AI)     |     |                  | --> | Transport: SQLite|
+-------------------+     |                  |     | (execution_logs) |
                          |                  | --> | Transport: IPC   |
                          +------------------+     | (to Renderer UI) |
                                                   +------------------+
```

**Logger**: Pino (v9) -- chosen for its performance (5x faster than Winston), native JSON output, async transport via worker threads, and low overhead.

```typescript
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL ?? 'info',
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) { return { level: label }; },
  },
  transport: {
    targets: [
      // File transport with rotation
      {
        target: 'pino/file',
        options: {
          destination: '~/.devrig/logs/app.log',
          mkdir: true,
        },
        level: 'debug',
      },
      // Pretty print for development
      ...(isDev ? [{
        target: 'pino-pretty',
        options: { colorize: true },
        level: 'debug',
      }] : []),
    ],
  },
});
```

### 14.2 Execution Logging

Every workflow run produces structured logs in the `execution_logs` table. The logger is scoped per-run and per-node:

```typescript
function createRunLogger(runId: string): Logger {
  return logger.child({ runId });
}

function createNodeLogger(runId: string, nodeId: string): Logger {
  return logger.child({ runId, nodeId });
}
```

**Log Levels for Execution**:
- `debug`: Variable resolution, condition evaluation details
- `info`: Node started, node completed, action output summaries
- `warn`: Retry triggered, non-fatal errors, slow execution
- `error`: Action failure, workflow failure, unhandled exceptions

### 14.3 Structured Log Format

```json
{
  "level": "info",
  "time": "2026-02-10T14:30:00.000Z",
  "runId": "clx1abc123",
  "nodeId": "http_request_1",
  "msg": "Action completed",
  "actionType": "http.request",
  "durationMs": 245,
  "statusCode": 200,
  "attempt": 1
}
```

### 14.4 Log Rotation and Retention

- **File logs**: Rotated daily, retained for 30 days, max 100MB total.
- **SQLite execution logs**: Retained for 90 days by default. A nightly maintenance job deletes older logs.
- **User-configurable**: Both retention periods are configurable via `app_settings`.

### 14.5 Performance Monitoring

The engine tracks and exposes metrics without requiring external monitoring infrastructure:

```typescript
interface EngineMetrics {
  // Queue
  queueDepth: number;
  queueProcessingRate: number;          // Jobs/minute

  // Workers
  activeWorkers: number;
  idleWorkers: number;

  // Execution (Flow Builder)
  runsActive: number;
  runsCompletedLast1h: number;
  runsFailedLast1h: number;
  avgRunDurationMs: number;

  // Inbox
  inboxUnreadCount: number;
  inboxActionableCount: number;
  inboxItemsLast24h: number;

  // Plugins
  activePlugins: number;
  pluginsSyncing: number;
  pluginSyncErrors: number;

  // AI
  aiCostLast24h: number;
  aiTokensLast24h: number;
  aiOperationsLast24h: number;
  aiCostByProvider: Record<string, number>;

  // System
  memoryUsageMb: number;
  cpuUsagePercent: number;
  dbSizeMb: number;
  walSizeMb: number;
}
```

These metrics are computed on-demand (not polled) when the Renderer requests them via IPC. For the WAL size metric, the engine monitors WAL file growth and triggers a checkpoint if it exceeds 100MB (preventing the unbounded WAL growth issue documented in better-sqlite3).

---

## 15. Error Handling & Retry Strategies

### 15.1 Error Classification

```typescript
enum ErrorCategory {
  TRANSIENT = 'transient',             // Network timeouts, rate limits -- retry
  PERMANENT = 'permanent',             // Invalid input, auth failure -- do not retry
  RESOURCE = 'resource',               // Out of memory, disk full -- retry with backoff
  TIMEOUT = 'timeout',                 // Execution exceeded timeout -- retry or fail
  CANCELLED = 'cancelled',            // User or system cancellation -- do not retry
  PLUGIN = 'plugin',                   // Plugin error -- retry with plugin reload
}

interface DevRigError {
  code: string;                        // Machine-readable, e.g. 'HTTP_TIMEOUT'
  category: ErrorCategory;
  message: string;
  details?: unknown;
  retryable: boolean;
  nodeId?: string;
  runId?: string;
  timestamp: string;
}
```

### 15.2 Retry Policy

```typescript
interface RetryPolicy {
  maxAttempts: number;                  // Default: 3
  strategy: 'fixed' | 'exponential' | 'linear';
  baseDelayMs: number;                  // Default: 1000
  maxDelayMs: number;                   // Default: 60000
  jitter: boolean;                      // Default: true (prevents thundering herd)
  retryOn?: ErrorCategory[];            // Default: ['transient', 'resource', 'timeout']
}
```

**Exponential Backoff with Jitter**:

```typescript
function computeDelay(policy: RetryPolicy, attempt: number): number {
  let delay: number;

  switch (policy.strategy) {
    case 'fixed':
      delay = policy.baseDelayMs;
      break;
    case 'linear':
      delay = policy.baseDelayMs * attempt;
      break;
    case 'exponential':
      delay = policy.baseDelayMs * Math.pow(2, attempt - 1);
      break;
  }

  delay = Math.min(delay, policy.maxDelayMs);

  if (policy.jitter) {
    // Full jitter: random value between 0 and computed delay
    delay = Math.random() * delay;
  }

  return Math.round(delay);
}
```

### 15.3 Circuit Breaker

For external service calls (HTTP actions, API integrations), a per-target circuit breaker prevents hammering failing services:

```typescript
interface CircuitBreakerConfig {
  failureThreshold: number;             // Default: 5 failures to open
  resetTimeoutMs: number;               // Default: 30000 (30s) before half-open
  halfOpenMaxAttempts: number;          // Default: 1 test request in half-open
  monitorWindowMs: number;              // Default: 60000 (1 min) sliding window
}

enum CircuitState {
  CLOSED = 'closed',                   // Normal operation
  OPEN = 'open',                       // Failing fast, no requests
  HALF_OPEN = 'half_open',            // Testing recovery
}
```

**Implementation**: Circuit breaker state is stored in-memory (not persisted) since it represents transient service health. Each unique action target (e.g., hostname for HTTP actions) gets its own circuit breaker instance.

### 15.4 Error Handling at Each Level

| Level | On Error | Behavior |
|-------|----------|----------|
| **Action** | Execution throws | Apply action-level retry policy. If exhausted, propagate to node. |
| **Node** | All action retries exhausted | Apply node-level retry policy. If exhausted, propagate to workflow. |
| **Workflow** | Node failure propagated | Based on `errorHandling` setting: `stop` (fail run), `skip` (mark node skipped, continue), `retry` (retry from failed node). |
| **Engine** | Unhandled exception | Log critical error, mark run as failed, emit `engine:error` event. |
| **Plugin** | Sandbox error | Log error, deactivate plugin, mark dependent workflows as degraded. |

### 15.5 Dead Letter Queue

Jobs that exhaust all retries are moved to a `dead` status in the `job_queue` table. A dedicated UI view shows dead-letter jobs with:
- Full error history (all attempts).
- The frozen run context at the point of failure.
- A "Retry" button that resets the job to `pending`.
- A "Discard" button that removes the job.

---

## 16. Package Manifest

### 16.1 Production Dependencies

```json
{
  "dependencies": {
    "better-sqlite3": "^11.7.0",
    "drizzle-orm": "^0.44.0",
    "@anthropic-ai/sdk": "^0.39.0",
    "@anthropic-ai/claude-code": "^1.0.0",
    "@modelcontextprotocol/sdk": "^1.12.0",
    "pino": "^9.6.0",
    "pino-pretty": "^13.0.0",
    "node-cron": "^3.0.3",
    "chokidar": "^4.0.0",
    "fastify": "^5.2.0",
    "zod": "^3.24.0",
    "@paralleldrive/cuid2": "^2.2.2",
    "p-queue": "^8.1.0",
    "isolated-vm": "^5.0.1",
    "handlebars": "^4.7.8",
    "lodash-es": "^4.17.21",
    "date-fns": "^4.1.0",
    "emittery": "^1.1.0"
  }
}
```

### 16.2 Development Dependencies

```json
{
  "devDependencies": {
    "drizzle-kit": "^0.30.0",
    "typescript": "^5.7.0",
    "@types/better-sqlite3": "^7.6.12",
    "@types/node": "^22.0.0",
    "vitest": "^3.0.0",
    "electron": "^34.0.0",
    "electron-builder": "^25.0.0",
    "tsup": "^8.0.0"
  }
}
```

### 16.3 Package Justification

| Package | Purpose | Why This One |
|---------|---------|-------------|
| `better-sqlite3` | SQLite database driver | Fastest synchronous SQLite for Node.js. Used by Signal. Supports WAL mode natively. |
| `drizzle-orm` | SQL ORM and query builder | TypeScript-first, zero overhead, excellent SQLite support, built-in migration tooling. |
| `@anthropic-ai/sdk` | Claude API client | Official Anthropic SDK for direct API calls with streaming support. |
| `@anthropic-ai/claude-code` | Claude Code agent SDK | Official SDK for programmatic Claude Code execution with tool control and cost tracking. |
| `@modelcontextprotocol/sdk` | MCP client/server | Official TypeScript SDK for Model Context Protocol. Supports stdio and HTTP transports. |
| `pino` | Structured logging | 5x faster than Winston. Native JSON output. Async transports via worker threads. |
| `node-cron` | Cron scheduler | Lightweight, pure JavaScript, supports 6-field expressions with seconds, timezone support. |
| `chokidar` | File system watching | Cross-platform, uses native fs events, handles edge cases that raw `fs.watch` does not. |
| `fastify` | HTTP server (webhooks) | Fastest Node.js HTTP framework. Schema-based validation. Low overhead for a local server. |
| `zod` | Runtime schema validation | TypeScript-first, zero dependencies, composable schemas, runtime + compile-time safety. |
| `@paralleldrive/cuid2` | ID generation | Collision-resistant, URL-safe, secure (no metadata leakage). Suitable for sync-ready IDs. |
| `p-queue` | Concurrency control | Promise-based queue with configurable concurrency, timeout, and cancellation via AbortSignal. |
| `isolated-vm` | Plugin sandboxing | V8 Isolate-based sandbox with memory/CPU limits. The only real security boundary in Node.js. |
| `emittery` | Typed event emitter | Modern, typed, async event emitter. No listener leak issues. Better API than Node EventEmitter. |
| `date-fns` | Date utilities | Tree-shakeable, immutable, TypeScript-native. No global pollution (unlike Moment/Day.js). |

---

## Appendix A: IPC Channel Map

All communication between the Electron Main and Renderer processes uses typed IPC channels:

```typescript
// ipc-channels.ts -- shared between main and renderer

interface IPCChannelMap {
  // ==========================================
  // Unified Inbox
  // ==========================================
  'inbox:list':          { args: InboxQuery; result: InboxItem[] };
  'inbox:get':           { args: { id: string }; result: InboxItem };
  'inbox:markRead':      { args: { ids: string[] }; result: void };
  'inbox:archive':       { args: { ids: string[] }; result: void };
  'inbox:snooze':        { args: { ids: string[]; until: string }; result: void };
  'inbox:unsnooze':      { args: { ids: string[] }; result: void };
  'inbox:search':        { args: { query: string; limit?: number }; result: InboxItem[] };
  'inbox:stats':         { args: void; result: InboxStats };
  'inbox:action':        { args: { itemId: string; actionId: string; input?: unknown }; result: ActionResult };

  // ==========================================
  // Plugins
  // ==========================================
  'plugin:list':         { args: void; result: PluginInfo[] };
  'plugin:install':      { args: { name: string }; result: void };
  'plugin:uninstall':    { args: { pluginId: string }; result: void };
  'plugin:toggle':       { args: { pluginId: string; enabled: boolean }; result: void };
  'plugin:syncNow':      { args: { pluginId: string; dataSourceId: string }; result: SyncResult };
  'plugin:syncStatus':   { args: void; result: SyncStatusMap };
  'plugin:settings':     { args: { pluginId: string }; result: PluginSettings };
  'plugin:updateSettings': { args: { pluginId: string; settings: unknown }; result: void };

  // ==========================================
  // AI Provider Layer
  // ==========================================
  'ai:providers':        { args: void; result: AIProviderInfo[] };
  'ai:usage':            { args: { period: string }; result: AIUsageSummary };
  'ai:usageByPlugin':    { args: { period: string }; result: Record<string, AIUsageSummary> };
  'ai:usageByProvider':  { args: { period: string }; result: Record<string, AIUsageSummary> };
  'ai:test-prompt':      { args: { templateId: string; variables: Record<string, unknown> }; result: string };
  'ai:classify':         { args: { itemId: string; pipelineId: string }; result: AIClassifyResponse };
  'ai:summarize':        { args: { itemId: string; pipelineId: string }; result: AISummarizeResponse };
  'ai:draft':            { args: { itemId: string; pipelineId: string }; result: AIDraftResponse };
  'ai:routingRules':     { args: void; result: RoutingRules };
  'ai:setRoutingRules':  { args: RoutingRules; result: void };

  // ==========================================
  // Workflow CRUD (Flow Builder)
  // ==========================================
  'workflow:list':       { args: { folderId?: string }; result: WorkflowSummary[] };
  'workflow:get':        { args: { id: string }; result: WorkflowDefinition };
  'workflow:create':     { args: WorkflowCreateInput; result: string };
  'workflow:update':     { args: WorkflowUpdateInput; result: void };
  'workflow:delete':     { args: { id: string }; result: void };

  // Execution (Flow Builder)
  'run:trigger':         { args: { workflowId: string; input?: unknown }; result: string };
  'run:cancel':          { args: { runId: string }; result: void };
  'run:get':             { args: { runId: string }; result: RunDetails };
  'run:list':            { args: { workflowId?: string; status?: string; limit?: number }; result: RunSummary[] };
  'run:logs':            { args: { runId: string; level?: string }; result: LogEntry[] };

  // ==========================================
  // Settings & Secrets
  // ==========================================
  'settings:get':        { args: { key: string }; result: unknown };
  'settings:set':        { args: { key: string; value: unknown }; result: void };

  'secrets:list':        { args: void; result: SecretSummary[] };
  'secrets:set':         { args: { name: string; value: string }; result: void };
  'secrets:delete':      { args: { name: string }; result: void };

  // ==========================================
  // Metrics
  // ==========================================
  'metrics:get':         { args: void; result: EngineMetrics };

  // ==========================================
  // Events (renderer subscribes)
  // ==========================================
  'event:inbox-update':  { data: { itemId: string; type: 'new' | 'updated' | 'archived' } };
  'event:sync-progress': { data: { pluginId: string; dataSourceId: string; progress: number } };
  'event:sync-complete': { data: SyncResult };
  'event:ai-pipeline':   { data: { itemId: string; stage: string; status: 'started' | 'completed' } };
  'event:run-progress':  { data: RunProgressEvent };
  'event:run-completed': { data: RunCompletedEvent };
  'event:ai-token':      { data: { runId: string; text: string } };
  'event:engine-error':  { data: DevRigError };
}
```

---

## Appendix B: Directory Structure

```
src/
  main/
    # ============================
    # Core: Plugin Runtime
    # ============================
    plugins/
      plugin-host.ts            -- Plugin lifecycle management
      plugin-registry.ts        -- Capability catalog and lookup
      plugin-sandbox.ts         -- isolated-vm sandbox
      plugin-sdk.ts             -- SDK injected into sandbox (data sources, actions, AI, views, flow)
      plugin-discovery.ts       -- Directory scanning and validation
      plugin-manifest.ts        -- Manifest schema validation (Zod)

    # ============================
    # Core: AI Provider Layer
    # ============================
    ai/
      provider-interface.ts     -- AIProvider interface definition
      provider-registry.ts      -- Provider registration and lookup
      model-router.ts           -- Per-task model selection, fallback chains
      pipeline-engine.ts        -- Composable AI pipeline execution
      context-manager.ts        -- Smart context injection, truncation
      cost-tracker.ts           -- Token/cost tracking across all providers
      providers/
        claude.ts               -- Built-in Anthropic Claude provider
      # Additional providers (OpenAI, Ollama) installed as plugins
      claude-api.ts             -- Direct Anthropic SDK client (flow builder actions)
      claude-code.ts            -- Claude Code CLI / Agent SDK
      mcp-client.ts             -- MCP client manager
      mcp-server.ts             -- DevRig as MCP server
      prompt-templates.ts       -- Template CRUD and rendering

    # ============================
    # Core: Unified Inbox
    # ============================
    inbox/
      inbox-service.ts          -- Inbox CRUD, queries, FTS search
      inbox-aggregator.ts       -- Cross-plugin item aggregation
      inbox-actions.ts          -- Action dispatch to plugins

    # ============================
    # Core: Sync Scheduler
    # ============================
    sync-scheduler/
      scheduler.ts              -- Timer management, job creation
      sync-executor.ts          -- Plugin sync invocation
      sync-state.ts             -- Cursor/state persistence

    # ============================
    # Flow Builder Engine
    # ============================
    engine/
      core.ts                   -- EngineCore singleton
      dag-executor.ts           -- DAG topological sort and execution
      condition-engine.ts       -- Condition evaluation
      template-engine.ts        -- Handlebars-style template rendering
    triggers/
      trigger-manager.ts        -- Trigger lifecycle management
      cron-trigger.ts           -- node-cron wrapper
      webhook-trigger.ts        -- Fastify webhook server
      filesystem-trigger.ts     -- chokidar wrapper
      polling-trigger.ts        -- HTTP/plugin polling
      manual-trigger.ts         -- Manual fire
      event-trigger.ts          -- Inter-workflow events
    actions/
      action-registry.ts        -- Action catalog
      action-pipeline.ts        -- Pre/post hooks, validation
      builtin/
        http.ts                 -- HTTP request actions
        file.ts                 -- File read/write actions
        shell.ts                -- Shell execution (sandboxed)
        data.ts                 -- Data transformation actions
        flow.ts                 -- Control flow actions
        notification.ts         -- Desktop notifications
        git.ts                  -- Git operations

    # ============================
    # Infrastructure
    # ============================
    queue/
      job-queue.ts              -- SQLite-backed job queue
      worker-pool.ts            -- Worker thread management
      worker.ts                 -- Worker thread entry point
    database/
      connection.ts             -- better-sqlite3 + WAL config
      schema.ts                 -- Drizzle ORM schema definitions
      repositories/
        inbox.repository.ts     -- Inbox item CRUD
        plugin-sync.repository.ts -- Sync state CRUD
        ai-operations.repository.ts -- AI cost tracking
        # ... existing repositories
      migrations/
        0001_initial.sql
        0002_add_ai_usage.sql
        0003_add_inbox.sql
        0004_add_plugin_sync.sql
        0005_add_ai_operations.sql
        ...
      migration-runner.ts       -- Startup migration executor
    cloud-sync/
      sync-engine.ts            -- Local sync state management (future)
      operation-log.ts          -- Mutation tracking
      conflict-resolver.ts      -- LWW and merge strategies
    logging/
      logger.ts                 -- Pino configuration
      execution-logger.ts       -- Run/node scoped logging
      log-transport-sqlite.ts   -- Custom Pino transport for SQLite
      log-rotation.ts           -- File log rotation
    ipc/
      ipc-handler.ts            -- Main process IPC registration
      channels.ts               -- Channel type definitions
    errors/
      error-types.ts            -- Error classification
      retry.ts                  -- Retry policy and delay computation
      circuit-breaker.ts        -- Per-target circuit breaker
    secrets/
      secrets-manager.ts        -- AES-256-GCM encryption/decryption
  renderer/
    (React UI -- out of scope for backend architecture)
  shared/
    types.ts                    -- Shared TypeScript types
    constants.ts                -- Shared constants
    validation.ts               -- Shared Zod schemas
```

---

## Appendix C: Security Considerations

1. **Secrets encryption**: All secrets are encrypted at rest using AES-256-GCM. The encryption key is derived from the OS keychain (Electron's `safeStorage` API). Secrets are never logged or included in error reports.

2. **Plugin permissions**: Plugins declare required permissions in their manifest. The sandbox enforces these permissions. A plugin without `network` permission cannot make HTTP requests. Without `secrets:read`, it cannot access secrets.

3. **Shell execution sandboxing**: The `shell.exec` action runs commands in a restricted environment. It does not have access to the DevRig process's environment variables by default. Users must explicitly whitelist commands and environment variables per workflow.

4. **Webhook security**: All webhook endpoints validate HMAC signatures when a secret is configured. Rate limiting prevents abuse. The local webhook server binds to `127.0.0.1` by default (not `0.0.0.0`) unless tunnel mode is enabled.

5. **SQL injection prevention**: All database queries go through Drizzle ORM's parameterized queries. No raw string concatenation in SQL. The database connection does not allow ATTACH or LOAD_EXTENSION.

6. **IPC security**: The Renderer Process has no direct access to Node.js APIs. All access goes through `contextBridge`-exposed functions that validate inputs with Zod before forwarding to the Main Process.

---

## Research Sources

- [Building a DAG-Based Workflow Execution Engine](https://medium.com/@amit.anjani89/building-a-dag-based-workflow-execution-engine-in-java-with-spring-boot-ba4a5376713d)
- [State of Open Source Workflow Orchestration Systems 2025](https://www.pracdata.io/p/state-of-workflow-orchestration-ecosystem-2025)
- [n8n Architecture: Open-Source Workflow Automation](https://www.ijcaonline.org/archives/volume187/number63/n8n-an-open-source-workflow-automation-for-enterprise-integration-and-ai-orchestration/)
- [n8n GitHub Repository](https://github.com/n8n-io/n8n)
- [Temporal.io: Durable Workflow Orchestration](https://bix-tech.com/understanding-temporal-durable-workflow-orchestration-for-realworld-data-applications/)
- [Rise of the Durable Execution Engine](https://www.kai-waehner.de/blog/2025/06/05/the-rise-of-the-durable-execution-engine-temporal-restate-in-an-event-driven-architecture-apache-kafka/)
- [Event Condition Action (Wikipedia)](https://en.wikipedia.org/wiki/Event_condition_action)
- [Polling vs Webhooks (ByteByteGo)](https://blog.bytebytego.com/p/ep100-polling-vs-webhooks)
- [Webhooks vs Polling (Merge.dev)](https://www.merge.dev/blog/webhooks-vs-polling)
- [better-sqlite3 Performance](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md)
- [SQLite Performance Tuning](https://phiresky.github.io/blog/2020/sqlite-performance-tuning/)
- [Drizzle ORM SQLite](https://orm.drizzle.team/docs/get-started-sqlite)
- [Drizzle Migrations](https://orm.drizzle.team/docs/migrations)
- [isolated-vm GitHub](https://github.com/laverdet/isolated-vm)
- [VS Code Extension API](https://code.visualstudio.com/api)
- [VS Code Patterns and Principles](https://vscode-docs.readthedocs.io/en/stable/extensions/patterns-and-principles/)
- [p-queue (Concurrency Control)](https://github.com/sindresorhus/p-queue)
- [better-queue with SQLite](https://www.npmjs.com/package/better-queue-sqlite)
- [Claude Code Programmatic Usage](https://code.claude.com/docs/en/headless)
- [Claude Agent SDK Cost Tracking](https://docs.claude.com/en/docs/agent-sdk/cost-tracking)
- [Anthropic TypeScript SDK](https://github.com/anthropics/anthropic-sdk-typescript)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Linear Sync Engine Architecture](https://www.fujimon.com/blog/linear-sync-engine)
- [Reverse Engineering Linear's Sync Engine](https://github.com/wzhudev/reverse-linear-sync-engine)
- [ElectricSQL vs PowerSync](https://www.powersync.com/blog/electricsql-vs-powersync)
- [Local-First Software Architecture Guide](https://techbuzzonline.com/local-first-software-architecture-guide/)
- [Pino Logger Guide (SigNoz)](https://signoz.io/guides/pino-logger/)
- [Pino Logger Guide (Better Stack)](https://betterstack.com/community/guides/logging/how-to-install-setup-and-use-pino-to-log-node-js-applications/)
- [node-cron Guide (Better Stack)](https://betterstack.com/community/guides/scaling-nodejs/node-cron-scheduled-tasks/)
- [chokidar GitHub](https://github.com/paulmillr/chokidar)
- [Electron IPC Tutorial](https://www.electronjs.org/docs/latest/tutorial/ipc)
- [Electron Performance Best Practices](https://www.electronjs.org/docs/latest/tutorial/performance)
- [Database Design for Audit Logging (Redgate)](https://www.red-gate.com/blog/database-design-for-audit-logging)
- [4 Common Designs of Audit Trail](https://medium.com/techtofreedom/4-common-designs-of-audit-trail-tracking-data-changes-in-databases-c894b7bb6d18)
- [CUID2 GitHub](https://github.com/paralleldrive/cuid2)
- [Zod Schema Validation](https://zod.dev/)
- [Circuit Breaker with Exponential Backoff](https://medium.com/@usama19026/building-resilient-applications-circuit-breaker-pattern-with-exponential-backoff-fc14ba0a0beb)
- [Node.js Retry Logic (OneUptime)](https://oneuptime.com/blog/post/2026-01-06-nodejs-retry-exponential-backoff/view)
- [Cloudflare Tunnel (ngrok alternative)](https://pinggy.io/blog/best_ngrok_alternatives/)
- [Schema Versioning (WorkflowEngine.io)](https://workflowengine.io/documentation/execution/scheme-update/)
