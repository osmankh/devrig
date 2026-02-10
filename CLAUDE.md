# DevRig

Commercial Electron desktop application for AI-native developer workflow automation. Visual flow builder + AI coding agents (Claude Code) + plugin ecosystem. Targeting $1M ARR within 12 months.

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
| AI | Claude API + Agent SDK | Latest |
| Secrets | Electron safeStorage + AES-256-GCM | Built-in |
| Licensing | Keygen.sh | SOC 2 compliant |
| Native Addons | NAPI-RS (Rust) | 2+ |

## Architecture

### Process Model
- **Main Process**: Lightweight coordinator - window management, IPC routing, auto-updater, tray
- **Renderer Process**: React 19 UI in Chromium sandbox
- **UtilityProcess**: SQLite database via better-sqlite3
- **Hidden Worker Window**: Workflow execution engine, plugin sandbox
- **Worker Threads**: CPU-intensive tasks, sync engine, search indexing

### Frontend Architecture (Feature-Sliced Design)
```
app/ > pages/ > widgets/ > features/ > entities/ > shared/
```
Strict unidirectional imports: each layer can only import from layers below it.

### Data Architecture (3-Tier, Linear-Inspired)
- **Tier 1 - Memory**: Zustand stores for instant reads, optimistic writes
- **Tier 2 - Local DB**: SQLite WAL for persistence, source of truth
- **Tier 3 - Cloud Sync**: Future - WebSocket deltas, LWW conflict resolution

### Execution Engine
- DAG-based workflow execution with topological sorting
- 6 trigger types: cron, webhook, filesystem, polling, manual, event
- JSON-based condition DSL with Zod validation
- Action executors: shell, HTTP, file, AI

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

## Project Structure

```
devrig/
├── CLAUDE.md                      # This file
├── docs/                          # Architecture documents
│   ├── master-plan.md             # Phased 18-week implementation plan
│   ├── business-analysis.md       # Market research, pricing, GTM
│   ├── frontend-architecture.md   # React 19, FSD, design system
│   ├── backend-architecture.md    # DAG engine, plugins, DB schema
│   ├── security-architecture.md   # Electron security, secrets, signing
│   ├── security-architecture-extended.md  # Extended security reference
│   └── performance-architecture.md # Perf budgets, startup, memory
├── src/
│   ├── main/                      # Electron main process
│   │   ├── db/                    # SQLite connection, schema, repos
│   │   ├── ipc/                   # IPC handlers (db, fs, ai, system)
│   │   ├── services/              # Executor, triggers, actions, AI
│   │   ├── secrets/               # safeStorage, keytar, field encryption
│   │   ├── plugins/               # Loader, sandbox, permissions, API
│   │   ├── integrations/          # Linear, GitHub clients
│   │   ├── licensing/             # Keygen.sh integration
│   │   └── telemetry/             # Sentry, PostHog (opt-in)
│   ├── preload/                   # contextBridge, typed IPC API
│   └── renderer/                  # React app (Feature-Sliced Design)
│       ├── app/                   # Providers, router, bootstrap, styles
│       ├── pages/                 # Dashboard, flow-editor, settings, plugins
│       ├── widgets/               # Sidebar, flow-canvas, command-palette
│       ├── features/              # Create-node, execute-flow, undo-redo
│       ├── entities/              # Flow, node, edge, execution, workspace
│       └── shared/                # UI components, lib, hooks, types
├── packages/
│   └── plugin-sdk/                # @devrig/plugin-sdk
├── native/                        # NAPI-RS Rust modules
├── tests/                         # Unit, component, e2e, performance
├── resources/                     # App icons
└── .github/workflows/             # CI, release, performance pipelines
```

## Database

SQLite with WAL mode, better-sqlite3 (synchronous reads), Drizzle ORM.

**Core tables**: workspaces, workflows, flow_nodes, flow_edges, executions, execution_steps, secrets, plugins, settings.

**Pragmas**: `journal_mode=WAL`, `synchronous=NORMAL`, `mmap_size=268435456`, `cache_size=-65536`.

## Key Conventions

- **Naming**: kebab-case for files/folders, PascalCase for components, camelCase for functions/variables
- **Imports**: Follow FSD layer rules - never import upward (e.g., entities cannot import from features)
- **State**: Zustand stores per entity domain, Immer for immutable updates, Zundo for undo/redo
- **IPC**: All IPC through typed preload API with channel whitelist validation
- **Components**: shadcn/ui copy-to-project pattern in `shared/ui/`
- **Styling**: Tailwind v4 with @theme tokens in OKLCH color space, 13px base font (Linear-style)
- **Testing**: Vitest for unit/component, Playwright for e2e, performance tests fail CI on budget violations

## Implementation Phases

1. **Foundation** (Weeks 1-3): Electron shell, SQLite, design system, layout, state, dashboard
2. **Flow Builder** (Weeks 4-6): React Flow canvas, custom nodes, execution engine, execution UI
3. **AI + UX** (Weeks 7-9): Claude integration, command palette, keyboard shortcuts, settings
4. **Integrations** (Weeks 10-13): Linear, GitHub, plugin SDK, marketplace, templates
5. **Hardening** (Weeks 14-16): Code signing, licensing, telemetry, performance optimization
6. **Launch** (Weeks 17-18): Testing, polish, landing page, community, Product Hunt

See `docs/master-plan.md` for the detailed task breakdown and agent strategy.

## Revenue Model

| Tier | Price | Limits |
|------|-------|--------|
| Free | $0 | 3 flows, 100 runs/mo |
| Pro | $19/mo | Unlimited flows, 2000 runs/mo, AI (500 actions) |
| Team | $39/user/mo | Pro + shared flows, SSO, 5000 runs/user |
| Enterprise | Custom | Self-hosted, unlimited, SLA |
