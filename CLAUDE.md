# DevRig

AI-powered developer command center. Unifies all developer tools (email, project management, code review, monitoring) into a single intelligent hub powered by AI plugins. Targeting $1M ARR within 12 months.

## Vision

Developers context-switch between 8-12 tools daily. DevRig is the single pane of glass where AI classifies, prioritizes, and acts on information from all your tools — so you see only what matters, with drafts and plans ready to go.

**Architecture**: Plugin-first. Every integration (Gmail, GitHub, Linear, Datadog) is a plugin. AI providers (Claude, OpenAI, Gemini, local) are also plugins. The core app is a shell with an AI brain, a unified inbox, and a visual flow builder for custom automations.

**Primary UI**: Unified inbox showing priority-sorted items from all connected plugins — emails classified by importance, sprint tickets pre-planned, PRs ready for review, alerts analyzed.

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Runtime | Electron | 34+ (Chromium 132+, Node.js 22+) |
| Build | electron-vite | 5.0 |
| Packaging | Electron Forge | 7.7+ |
| Language | TypeScript | 5.7+ (strict mode) |
| UI Framework | React 19 + React Compiler | 19.1+ |
| Flow Builder | @xyflow/react | 12.10+ |
| State | Zustand + Immer + Zundo | 5.0+ |
| Design System | shadcn/ui + Radix UI | Latest |
| CSS | Tailwind CSS v4 | 4.1+ (@theme directive) |
| Animations | Motion | 12.4+ |
| Command Palette | cmdk | 1.1+ |
| Virtual Scroll | TanStack Virtual | 3.13+ |
| Database | SQLite via better-sqlite3 | 11.8+ (WAL mode) |
| ORM | Drizzle ORM | Latest |
| Plugin Sandbox | isolated-vm | Latest (NOT vm2) |
| AI | Multi-model (Claude first, OpenAI, Gemini, local) | Latest |
| Secrets | Electron safeStorage + AES-256-GCM | Built-in |
| Licensing | Keygen.sh | SOC 2 compliant |
| Native Addons | NAPI-RS (Rust) | 2+ |

## Architecture

### Process Model
- **Main Process**: Coordinator — plugin manager, AI provider layer, IPC routing, window management, tray
- **Renderer Process**: React 19 UI — unified inbox, flow builder, settings, plugin views
- **Database**: SQLite in main process (not UtilityProcess) for sub-1ms sync reads
- **Hidden Worker Window**: Workflow execution engine, plugin sandbox (isolated-vm)
- **Worker Threads**: CPU-intensive tasks, sync engine, search indexing

### Plugin-First Architecture
Everything is a plugin. The core app provides:
1. **Plugin runtime** — lifecycle, sandbox, permissions, IPC bridge
2. **AI provider abstraction** — multi-model routing, cost tracking, pipelines
3. **Unified inbox** — renders items from all plugins in a priority-sorted feed
4. **Flow builder** — visual automation canvas for cross-plugin workflows
5. **Data layer** — SQLite storage, sync scheduling, secrets management

Plugins provide:
1. **Data sources** — fetch emails, tickets, PRs, alerts from external services
2. **AI pipelines** — classification rules, prompt templates, drafting logic
3. **Actions** — reply to email, assign ticket, approve PR, acknowledge alert
4. **Views** — custom UI panels registered in the dashboard
5. **Flow nodes** — custom trigger/action/condition nodes for the flow builder

### Frontend Architecture (Feature-Sliced Design)
```
app/ > pages/ > widgets/ > features/ > entities/ > shared/
```
Strict unidirectional imports: each layer can only import from layers below it.

### Data Architecture (3-Tier, Linear-Inspired)
- **Tier 1 - Memory**: Zustand stores for instant reads, optimistic writes
- **Tier 2 - Local DB**: SQLite WAL for persistence, source of truth
- **Tier 3 - Cloud Sync**: Future - WebSocket deltas, LWW conflict resolution

### AI Provider Abstraction
- Provider interface: complete(), stream(), classify(), summarize(), draft()
- Claude as default first-class provider
- Additional providers as plugins (OpenAI, Gemini, local/Ollama)
- Model router: per-task model selection, fallback chains, cost tracking
- AI pipeline engine: composable pipelines (classify → filter → summarize → draft)

### Execution Engine
- DAG-based workflow execution with topological sorting
- Plugins register custom triggers and action executors
- JSON-based condition DSL with Zod validation
- Built-in executors: shell, HTTP, file + plugin-provided executors

## Security Requirements (Non-Negotiable)

- `nodeIntegration: false` on ALL BrowserWindows
- `contextIsolation: true` on ALL BrowserWindows
- `sandbox: true` on ALL BrowserWindows
- IPC channel whitelist - no raw ipcRenderer exposure
- CSP enforced via meta tag AND programmatic headers
- Secrets NEVER in localStorage - safeStorage or keychain only
- vm2 is BANNED (CVE-2026-22709, CVSS 9.8) - use isolated-vm only
- Auto-update signature verification required
- Plugin sandbox: isolated-vm V8 isolates, 128MB memory, 5s timeout
- Plugin data isolation: plugins can only access their own inbox items and secrets
- AI API keys never sent to renderer process
- OAuth tokens stored via safeStorage, proxied through host functions

## Performance Budgets (CI-Enforced)

| Metric | Target | Hard Limit (Fails CI) |
|--------|--------|-----------------------|
| Cold start | < 1.5s | 2.0s |
| Hot start | < 200ms | 300ms |
| Click response | < 50ms | 100ms |
| Scroll | 60fps | 55fps |
| Idle memory | < 150MB | 200MB |
| SQLite read | < 1ms | 3ms |
| IPC round-trip | < 5ms | 10ms |
| Renderer bundle | < 300KB gzip | 500KB gzip |
| Plugin isolate creation | < 100ms | 200ms |
| AI classification (background) | < 3s | 5s |

## Project Structure

```
devrig/
├── CLAUDE.md                      # This file
├── docs/                          # Architecture documents
│   ├── master-plan.md             # Phased 21-week implementation plan
│   ├── business-analysis.md       # Market research, pricing, GTM
│   ├── frontend-architecture.md   # React 19, FSD, unified inbox, design system
│   ├── backend-architecture.md    # Plugin system, AI layer, DAG engine, DB schema
│   ├── security-architecture.md   # Electron security, plugin sandbox, secrets
│   ├── security-architecture-extended.md  # Extended security reference
│   └── performance-architecture.md # Perf budgets, startup, memory
├── src/
│   ├── main/                      # Electron main process
│   │   ├── ai/                    # AI provider layer, pipelines, cost tracking
│   │   ├── db/                    # SQLite connection, schema, repos
│   │   ├── ipc/                   # IPC handlers (db, plugin, ai, execution, system)
│   │   ├── plugins/               # Plugin loader, sandbox, permissions, API
│   │   ├── services/              # Executor, sync scheduler, triggers, actions
│   │   ├── secrets/               # safeStorage, field encryption
│   │   ├── licensing/             # Keygen.sh integration
│   │   └── telemetry/             # Sentry, PostHog (opt-in)
│   ├── preload/                   # contextBridge, typed IPC API
│   └── renderer/                  # React app (Feature-Sliced Design)
│       ├── app/                   # Providers, router, plugin-views, styles
│       ├── pages/                 # Inbox (primary), flow-editor, settings, marketplace
│       ├── widgets/               # Sidebar, detail-panel, ai-draft-panel, flow-canvas, command-palette
│       ├── features/              # Inbox-filter, inbox-actions, onboarding, configure-node, undo-redo
│       ├── entities/              # InboxItem, Plugin, AIProvider, Flow, Node, Edge, Execution, Workspace
│       └── shared/                # UI components, lib, hooks, types
├── plugins/                       # First-party plugins
│   ├── gmail/                     # Email: fetch, classify, draft, reply
│   ├── github/                    # PRs, issues, AI code review
│   ├── linear/                    # Tickets, sprint planning
│   ├── jira/                      # Jira adapter
│   ├── sentry/                    # Error tracking, AI analysis
│   └── ...                        # datadog, cloudwatch, clickup, etc.
├── packages/
│   ├── plugin-sdk/                # @devrig/plugin-sdk
│   └── plugin-cli/                # devrig publish CLI
├── native/                        # NAPI-RS Rust modules
├── tests/                         # Unit, component, e2e, performance
├── resources/                     # App icons
└── .github/workflows/             # CI, release, performance pipelines
```

## Database

SQLite with WAL mode, better-sqlite3 (synchronous reads), Drizzle ORM.

**Core tables**: workspaces, workflows, flow_nodes, flow_edges, executions, execution_steps, secrets, plugins, settings.

**New tables (v2)**: inbox_items, plugin_sync_state, ai_operations.

**Pragmas**: `journal_mode=WAL`, `synchronous=NORMAL`, `mmap_size=268435456`, `cache_size=-65536`.

## Key Conventions

- **Naming**: kebab-case for files/folders, PascalCase for components, camelCase for functions/variables
- **Imports**: Follow FSD layer rules - never import upward (e.g., entities cannot import from features)
- **State**: Zustand stores per entity domain, Immer for immutable updates, Zundo for undo/redo
- **IPC**: All IPC through typed preload API with channel whitelist validation
- **Components**: shadcn/ui copy-to-project pattern in `shared/ui/`
- **Styling**: Tailwind v4 with @theme tokens in OKLCH color space, 13px base font (Linear-style)
- **Plugins**: Follow plugin SDK contract. Plugins provide data sources, actions, AI pipelines, views, flow nodes
- **AI**: All AI operations go through the AI provider abstraction. Never call AI APIs directly
- **Testing**: Vitest for unit/component, Playwright for e2e, performance tests fail CI on budget violations

## Implementation Phases

1. **Foundation** (Weeks 1-3) ✅: Electron shell, SQLite, design system, layout, state, dashboard
2. **Plugin SDK + AI Layer** (Weeks 4-6): Plugin runtime, AI provider abstraction, Claude provider, inbox data model
3. **Unified Inbox** (Weeks 7-9): Inbox UI, inline actions, AI draft panel, command palette, settings, onboarding
4. **First-Party Plugins** (Weeks 10-13): Gmail, GitHub, Linear/Jira/ClickUp, cross-plugin flow builder
5. **Monitoring + Multi-AI** (Weeks 14-16): Sentry/Datadog/CloudWatch, OpenAI/Gemini/local providers, marketplace
6. **Hardening** (Weeks 17-19): Code signing, licensing, telemetry, performance optimization
7. **Launch** (Weeks 20-21): Testing, polish, landing page, community, Product Hunt

See `docs/master-plan.md` for the detailed task breakdown and agent strategy.

## Revenue Model

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 3 plugins, 100 AI actions/mo, 5 flows |
| Pro | $19/mo | Unlimited plugins, 500 AI actions/mo, unlimited flows |
| Team | $39/user/mo | Pro + shared inbox views, team flows, SSO, 2000 AI actions/user |
| Enterprise | Custom | Self-hosted, unlimited, custom plugins, SLA |
