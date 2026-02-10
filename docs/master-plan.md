# DevRig: Master Implementation Plan

**Version**: 1.0 | **Date**: 2026-02-10
**Status**: Ready for Implementation

---

## Executive Summary

DevRig is a commercial Electron desktop application for AI-native developer workflow automation. It combines a visual flow builder, AI coding agents (Claude Code), and a plugin ecosystem in a desktop-native experience targeting $1M ARR within 12 months.

This document synthesizes 5 architecture research documents into a single actionable build plan.

---

## 1. Unified Technology Stack

### Core Platform

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Desktop Runtime** | Electron | 34+ | User's explicit choice; ecosystem advantage; Chromium 132+, Node.js 22+ |
| **Build Tool** | electron-vite | 5.0 | Purpose-built for Electron; V8 bytecode compilation; HMR |
| **Packaging** | Electron Forge | 7.7+ | .dmg, .exe, .AppImage output; code signing integration |
| **Language** | TypeScript | 5.7+ | Strict mode across all processes |

### Frontend (Renderer Process)

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **UI Framework** | React 19 + React Compiler | 19.1+ | Automatic memoization; largest ecosystem |
| **Flow Builder** | @xyflow/react | 12.10+ | 1.15M weekly downloads; viewport-based rendering |
| **State Management** | Zustand + Immer + Zundo | 5.0+ | Centralized stores; immutable updates; undo/redo |
| **Design System** | shadcn/ui + Radix UI | 1.2+ | Copy-to-project; full ownership; accessibility |
| **CSS** | Tailwind CSS v4 | 4.1+ | @theme directive; CSS-first design tokens |
| **Animations** | Motion (Framer Motion successor) | 12.4+ | WAAPI hybrid engine; spring physics |
| **Command Palette** | cmdk | 1.1+ | Same as Linear/Raycast; under 5KB |
| **Virtual Scrolling** | TanStack Virtual | 3.13+ | 60fps with 10K+ items |
| **Fonts** | Inter Variable + JetBrains Mono | Latest | Linear-style typography |

### Backend (Main Process / Workers)

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **Database** | SQLite via better-sqlite3 | 11.8+ | Zero external deps; synchronous reads; WAL mode |
| **ORM** | Drizzle ORM | Latest | Type-safe; lightweight; SQLite-native |
| **Plugin Sandbox** | isolated-vm | Latest | V8 isolates; 128MB memory limit; 5s timeout |
| **Job Queue** | SQLite-backed custom | N/A | No Redis dependency; atomic dequeue |
| **Logging** | Pino | 9+ | Structured JSON logging |
| **AI Integration** | Claude API + Agent SDK | Latest | First-class AI workflow actions |
| **Native Addons** | NAPI-RS (Rust) | 2+ | 10x perf for CPU-intensive ops |

### Security & Distribution

| Component | Technology | Rationale |
|-----------|-----------|-----------|
| **Secrets** | Electron safeStorage + keytar fallback | OS keychain integration |
| **Field Encryption** | AES-256-GCM | Authenticated encryption for SQLite fields |
| **DB Encryption** | SQLCipher (optional) | Full database encryption at rest |
| **Code Signing (macOS)** | Apple Developer ID + notarytool | Hardened runtime; notarization |
| **Code Signing (Windows)** | EV certificate + Authenticode | DigiCert KeyLocker for HSM |
| **Licensing** | Keygen.sh | SOC 2 compliant; offline grace period |
| **Crash Reporting** | Sentry (opt-in) | PII scrubbing; Electron SDK |
| **Analytics** | PostHog self-hosted (opt-in) | Anonymous; privacy-first |
| **Auto-Update** | electron-updater + GitHub Releases | Signed manifests; staged rollout |
| **CI/CD** | GitHub Actions | Multi-platform builds |

---

## 2. Architecture Overview

```
+------------------------------------------------------------------+
|  RENDERER PROCESS (Chromium Sandbox)                              |
|                                                                    |
|  React 19 + React Compiler                                        |
|  ├── Feature-Sliced Design (6 layers)                             |
|  ├── Zustand stores (in-memory state, Tier 1)                     |
|  ├── @xyflow/react (visual flow builder)                          |
|  ├── shadcn/ui + Tailwind v4 (design system)                     |
|  ├── cmdk (command palette)                                       |
|  ├── Motion (animations)                                          |
|  └── TanStack Virtual (scrolling)                                 |
|                                                                    |
+------------------------------|-------------------------------------+
                               | IPC (invoke/handle, channel whitelist)
+------------------------------|-------------------------------------+
|  MAIN PROCESS (Node.js - Lightweight Coordinator)                 |
|                                                                    |
|  ├── Window management & app lifecycle                            |
|  ├── IPC router (validates sender, routes to workers)             |
|  ├── Auto-updater                                                 |
|  ├── System tray                                                  |
|  └── License validation                                           |
|                                                                    |
+----------|----------------|----------------|----------------------+
           |                |                |
    +------v------+  +------v------+  +------v------+
    | UtilityProc |  | Hidden      |  | Worker      |
    | (Database)  |  | Window      |  | Threads     |
    |             |  | (Automation)|  | (CPU tasks) |
    | SQLite WAL  |  | Workflow    |  | Sync engine |
    | better-     |  | execution   |  | Data xform  |
    | sqlite3     |  | Plugin      |  | Search      |
    | Drizzle ORM |  | sandbox     |  | indexing    |
    +-------------+  +-------------+  +-------------+
```

### Data Architecture (3-Tier, Linear-Inspired)

```
Tier 1: Memory (Zustand)      - Instant reads, optimistic writes
Tier 2: Local DB (SQLite WAL)  - Persistent, source of truth
Tier 3: Cloud Sync (Future)    - WebSocket deltas, LWW conflict resolution
```

### Performance Targets

| Metric | Target | Hard Limit |
|--------|--------|-----------|
| Cold start to interactive | < 1.5s | 2.0s |
| Hot start (system tray) | < 200ms | 300ms |
| Click response | < 50ms | 100ms |
| Scroll framerate | 60fps | 55fps |
| Idle memory | < 150MB | 200MB |
| SQLite read (indexed) | < 1ms | 3ms |
| IPC round-trip | < 5ms | 10ms |
| Initial renderer bundle | < 300KB gzip | 500KB gzip |

---

## 3. Phased Implementation Plan

### Phase 1: Foundation (Weeks 1-3)

**Goal**: Bootable Electron app with project scaffolding, design system, and database layer.

#### Week 1: Project Scaffold & Electron Shell

| Task | Description | Files |
|------|-------------|-------|
| **1.1** Initialize monorepo | `package.json`, `tsconfig.json` (main, preload, renderer), `electron.vite.config.ts`, `forge.config.ts` | Root config files |
| **1.2** Electron main process | Window creation with security defaults (`nodeIntegration: false`, `contextIsolation: true`, `sandbox: true`), CSP headers, navigation guards, permission denials | `src/main/index.ts`, `src/main/csp.ts`, `src/main/navigation-guard.ts`, `src/main/permissions.ts` |
| **1.3** Preload script | contextBridge with channel whitelist, typed IPC API | `src/preload/index.ts`, `src/preload/api.ts` |
| **1.4** Renderer entry | React 19 entry point, providers, Tailwind v4 setup, dark/light theme tokens | `src/renderer/main.tsx`, `src/renderer/app/`, styles |
| **1.5** State-based router | Zustand-powered view router (not URL-based) with `React.lazy` code splitting | `src/renderer/app/router/` |
| **1.6** IPC security layer | `secureHandle()` wrapper with sender validation for main process | `src/main/ipc-security.ts` |

**Deliverable**: Electron app launches, shows an empty shell with dark theme, window controls work.

#### Week 2: Database & Design System

| Task | Description | Files |
|------|-------------|-------|
| **2.1** SQLite setup | better-sqlite3 connection with WAL mode, performance pragmas (mmap 256MB, cache 64MB, synchronous NORMAL) | `src/main/db/connection.ts` |
| **2.2** Database schema | Core tables: `workspaces`, `workflows`, `flow_nodes`, `flow_edges`, `executions`, `execution_steps`, `settings` | `src/main/db/migrations/`, `src/main/db/schema.ts` |
| **2.3** Prepared statement cache | Statement cache class to avoid recompilation | `src/main/db/statement-cache.ts` |
| **2.4** Repository layer | Data access objects for workflows, nodes, executions | `src/main/db/repositories/` |
| **2.5** IPC database handlers | `db:getFlow`, `db:saveFlow`, `db:updateNode`, `db:listWorkflows` handlers | `src/main/ipc/db-handlers.ts` |
| **2.6** Design system setup | Install shadcn/ui, configure Tailwind v4 @theme tokens, Inter + JetBrains Mono fonts, OKLCH color system | `src/renderer/shared/ui/`, `src/renderer/app/styles/tokens.css` |
| **2.7** Core UI components | Button, Input, Dialog, DropdownMenu, Tooltip, ScrollArea, Badge, Toast (Sonner), Tabs, Separator | `src/renderer/shared/ui/*.tsx` |

**Deliverable**: Database reads/writes work via IPC. Design system components rendered on screen.

#### Week 3: Layout Shell & State Management

| Task | Description | Files |
|------|-------------|-------|
| **3.1** App layout | Sidebar + main content + property panel (resizable via shadcn ResizablePanel) | `src/renderer/widgets/` |
| **3.2** Sidebar component | Workspace navigation, flow list, collapsed/expanded states with Motion animation | `src/renderer/widgets/sidebar/` |
| **3.3** Zustand stores | `flow-store.ts` (nodes, edges, viewport), `workspace-store.ts` (preferences), `ui-store.ts` (panels, modals) | `src/renderer/entities/*/model/` |
| **3.4** Immer middleware | Enable immutable updates with mutable syntax across stores | Integrated into stores |
| **3.5** Zundo undo/redo | Temporal middleware on flow-store, 100-state history, partialized | `src/renderer/features/undo-redo/` |
| **3.6** Optimistic update pattern | Write-through from Zustand to SQLite with rollback on failure | `src/renderer/shared/lib/optimistic.ts` |
| **3.7** Tiered data loading | Bootstrap cache (localStorage), partial load (IPC), full load (deferred) | `src/renderer/app/bootstrap.ts`, `src/renderer/app/data-loader.ts` |
| **3.8** Dashboard page | Flow list with virtual scrolling (TanStack Virtual), recent items, create new flow button | `src/renderer/pages/dashboard/` |

**Deliverable**: Full app shell with sidebar, dashboard, resizable panels, theme switching, data persisted to SQLite.

---

### Phase 2: Flow Builder (Weeks 4-6)

**Goal**: Visual workflow editor with custom nodes, drag-and-drop, and basic execution.

#### Week 4: React Flow Canvas

| Task | Description | Files |
|------|-------------|-------|
| **4.1** Flow canvas widget | @xyflow/react setup with project defaults, viewport controls, minimap, background grid | `src/renderer/widgets/flow-canvas/` |
| **4.2** Custom node types | BaseNode, TriggerNode, ActionNode, ConditionNode, AINode, LoopNode, SubflowNode | `src/renderer/entities/node/ui/` |
| **4.3** Node registry | Maps node type strings to React components | `src/renderer/entities/node/model/node-registry.ts` |
| **4.4** Node palette | Draggable sidebar with available node types, drag-and-drop onto canvas | `src/renderer/widgets/node-palette/` |
| **4.5** Edge connections | Custom edge styles, animated data flow indicators, connection validation | `src/renderer/entities/edge/` |
| **4.6** Flow store integration | React Flow state synced with Zustand flow-store, bidirectional | `src/renderer/entities/flow/model/flow-store.ts` |

#### Week 5: Node Configuration & Execution Engine

| Task | Description | Files |
|------|-------------|-------|
| **5.1** Property panel | Context-sensitive node configuration editor that appears when a node is selected | `src/renderer/widgets/property-panel/` |
| **5.2** Node config forms | Per-node-type configuration: trigger (cron/webhook/manual), action (shell/HTTP/file), condition (JSON DSL) | `src/renderer/features/configure-node/` |
| **5.3** DAG execution engine | Topological sort, step-by-step execution, status tracking per node | `src/main/services/flow-executor.ts` |
| **5.4** Trigger system | Manual trigger (button click), cron trigger (node-cron), webhook trigger (local HTTP server) | `src/main/services/triggers/` |
| **5.5** Condition evaluator | JSON-based condition DSL with Zod validation: `{"field": "status", "op": "eq", "value": "done"}` | `src/main/services/condition-engine.ts` |
| **5.6** Action executors | Shell command, HTTP request, file operations | `src/main/services/actions/` |

#### Week 6: Execution UI & Flow Persistence

| Task | Description | Files |
|------|-------------|-------|
| **6.1** Execution panel | Real-time execution timeline showing step status (pending/running/success/error) | `src/renderer/widgets/execution-panel/` |
| **6.2** Execution store | Zustand store for running executions, logs, step statuses | `src/renderer/entities/execution/` |
| **6.3** Flow save/load | Serialize flow to SQLite, load on open, auto-save on change (debounced) | IPC handlers + store integration |
| **6.4** Flow import/export | JSON export/import for flow sharing | `src/renderer/features/import-export/` |
| **6.5** Node status visualization | Color-coded node borders during execution (green=success, red=error, blue=running, gray=pending) | Node component updates |
| **6.6** Execution history page | List of past executions with status, duration, re-run capability | `src/renderer/pages/execution-history/` |

**Deliverable**: Working visual flow builder. Users can create flows with triggers/conditions/actions, execute them, and see results in real-time.

---

### Phase 3: AI Integration & Command Palette (Weeks 7-9)

**Goal**: Claude Code as a first-class workflow action, command palette, keyboard-first UX.

#### Week 7: AI Integration

| Task | Description | Files |
|------|-------------|-------|
| **7.1** AI service layer | Claude API client with streaming, model selection, cost tracking | `src/main/services/ai-service.ts` |
| **7.2** AI action node | Configurable AI node: prompt template, model selection, context injection, response handling | `src/main/services/actions/ai-action.ts` |
| **7.3** AI assistant panel | Chat-style AI interaction panel for flow building assistance | `src/renderer/widgets/ai-assistant/` |
| **7.4** AI flow generation | "Describe your workflow" -> AI generates flow nodes and connections | `src/renderer/features/ai-generate/` |
| **7.5** AI store | Model configs, conversation history, usage tracking | `src/renderer/entities/ai-model/` |
| **7.6** MCP protocol integration | Connect to MCP servers for extended AI capabilities (Linear, GitHub) | `src/main/services/mcp-client.ts` |

#### Week 8: Command Palette & Keyboard Navigation

| Task | Description | Files |
|------|-------------|-------|
| **8.1** Command palette | cmdk integration with shadcn Command component, Cmd+K activation | `src/renderer/widgets/command-palette/` |
| **8.2** Command registry | Centralized command definitions with keyboard shortcuts | `src/renderer/widgets/command-palette/model/commands.ts` |
| **8.3** Keyboard shortcut system | Global shortcut registry, platform-aware modifiers, context-sensitive, customizable | `src/renderer/shared/lib/shortcuts.ts` |
| **8.4** Shortcut provider | React context for shortcut registration/deregistration | `src/renderer/app/providers/ShortcutProvider.tsx` |
| **8.5** Canvas shortcuts | A (add node), Space+Drag (pan), Cmd+0 (fit), Delete (remove), Cmd+D (duplicate) | Canvas integration |
| **8.6** Global shortcuts | Cmd+N (new flow), Cmd+S (save), Cmd+Z/Shift+Z (undo/redo), Cmd+B (sidebar), Cmd+Enter (run) | App-level integration |

#### Week 9: Settings & Secrets Management

| Task | Description | Files |
|------|-------------|-------|
| **9.1** Settings page | Tabbed settings: General, AI Models, Integrations, Shortcuts, About | `src/renderer/pages/settings/` |
| **9.2** Secrets management | safeStorage integration for API keys, keytar fallback, AES-256-GCM field encryption | `src/main/secrets/` |
| **9.3** API key management UI | Add/remove/test API keys for Claude, GitHub, Linear with secure storage | Settings integration |
| **9.4** Theme settings | Dark/light/system theme selection, persisted to workspace-store | Settings integration |
| **9.5** User preferences | Default view, sidebar state, editor preferences, flow auto-save interval | Settings integration |

**Deliverable**: AI-powered flow building. Cmd+K command palette. Keyboard-first UX. Secrets securely stored.

---

### Phase 4: Integrations & Plugin System (Weeks 10-13)

**Goal**: Linear + GitHub integrations working. Plugin SDK v1.0.

#### Week 10: Linear Integration

| Task | Description | Files |
|------|-------------|-------|
| **10.1** Linear API client | OAuth2 flow, issue CRUD, webhook handling, label/status management | `src/main/integrations/linear/` |
| **10.2** Linear trigger node | Trigger on: issue assigned, status changed, label added, comment added | Integration with trigger system |
| **10.3** Linear action node | Create issue, update status, add comment, assign user | Integration with action system |
| **10.4** Linear condition node | Check issue status, priority, labels, assignee | Integration with condition engine |
| **10.5** OAuth flow UI | In-app OAuth authorization flow for Linear | `src/renderer/features/oauth/` |

#### Week 11: GitHub Integration

| Task | Description | Files |
|------|-------------|-------|
| **11.1** GitHub API client | OAuth2/PAT, repository access, PR management, issue management | `src/main/integrations/github/` |
| **11.2** GitHub trigger node | Trigger on: PR opened, push to branch, issue created, review requested | Integration with trigger system |
| **11.3** GitHub action node | Create PR, merge PR, create issue, add comment, request review | Integration with action system |
| **11.4** GitHub condition node | Check branch status, review approval, CI status | Integration with condition engine |

#### Week 12: Plugin SDK & Sandbox

| Task | Description | Files |
|------|-------------|-------|
| **12.1** Plugin manifest schema | JSON schema for plugin declarations: permissions, resources, metadata | `src/main/plugins/manifest-schema.ts` |
| **12.2** Plugin loader | Discover, validate, and load plugins from plugin directory | `src/main/plugins/plugin-loader.ts` |
| **12.3** isolated-vm sandbox | V8 isolate per plugin, 128MB memory, 5s timeout, capability-gated host functions | `src/main/plugins/isolate-sandbox.ts` |
| **12.4** Plugin permission model | Network allowlist, file read/write path restrictions, secret access control | `src/main/plugins/permissions.ts` |
| **12.5** Plugin API surface | Host functions exposed to plugins: `log`, `fetch`, `readFile`, `getSecret`, `emitEvent` | `src/main/plugins/plugin-api.ts` |
| **12.6** Plugin SDK package | `@devrig/plugin-sdk` npm package with types, helpers, example plugin | `packages/plugin-sdk/` |

#### Week 13: Plugin Marketplace UI & Template Flows

| Task | Description | Files |
|------|-------------|-------|
| **13.1** Plugin manager UI | Browse installed plugins, install/remove, permission review, settings | `src/renderer/pages/plugins/` |
| **13.2** Plugin settings integration | Per-plugin configuration UI generated from manifest | Plugin page integration |
| **13.3** Flow templates | Pre-built templates: "Linear bug -> Claude Code analysis", "GitHub PR -> AI review", "Cron -> report generation" | `src/main/templates/` |
| **13.4** Template gallery UI | Browse and one-click install flow templates | `src/renderer/features/templates/` |

**Deliverable**: Linear + GitHub integrations working end-to-end. Plugin SDK published. Template flows available.

---

### Phase 5: Production Hardening (Weeks 14-16)

**Goal**: Code signing, licensing, auto-update, performance optimization, crash reporting.

#### Week 14: Code Signing & Distribution

| Task | Description | Files |
|------|-------------|-------|
| **14.1** macOS code signing | Apple Developer ID, hardened runtime, entitlements, notarization via @electron/notarize | `build/entitlements.mac.plist`, `scripts/notarize.js` |
| **14.2** Windows code signing | EV certificate, Authenticode, SHA-256, timestamp counter-signature | `scripts/custom-sign.js` |
| **14.3** Linux packaging | .deb + .rpm + .AppImage with GPG signatures | Forge config |
| **14.4** GitHub Actions CI/CD | Multi-platform build pipeline with secret management, SBOM generation | `.github/workflows/release.yml` |
| **14.5** Auto-updater | electron-updater with GitHub Releases, signature verification, staged rollout, user prompt | `src/main/services/auto-updater.ts` |

#### Week 15: Licensing & Telemetry

| Task | Description | Files |
|------|-------------|-------|
| **15.1** License manager | Keygen.sh integration, machine fingerprint, online/offline validation, 30-day grace | `src/main/licensing/` |
| **15.2** License UI | Activation dialog, license status display, tier indicator | `src/renderer/features/licensing/` |
| **15.3** Free tier enforcement | 3 active flows, 100 runs/month, feature gating | `src/main/services/tier-manager.ts` |
| **15.4** Sentry crash reporting | Opt-in, PII scrubbing (paths, tokens, emails), main + renderer initialization | `src/main/telemetry/sentry.ts` |
| **15.5** PostHog analytics | Opt-in, anonymous, allowlisted properties, self-hosted endpoint | `src/main/telemetry/analytics.ts` |

#### Week 16: Performance Optimization

| Task | Description | Files |
|------|-------------|-------|
| **16.1** V8 bytecode compilation | electron-vite bytecodePlugin for main + preload | `electron.vite.config.ts` update |
| **16.2** Deferred module loading | Tiered imports: critical first, background second, deferred third | Main process refactor |
| **16.3** CSS containment | `contain: layout style paint` on major sections, `content-visibility: auto` on list items | CSS updates |
| **16.4** Performance marks | Instrument startup phases, IPC latency, interaction response times | `src/renderer/shared/lib/perf-marks.ts` |
| **16.5** CI performance tests | Playwright-driven startup time, memory, FPS, IPC latency tests that fail build on regression | `tests/performance/` |
| **16.6** Memory management | ScopedIPC cleanup, WeakRef caches, GC hints on state transitions, memory monitor | Various files |

**Deliverable**: Signed, notarized, auto-updating app. Licensed with free/pro tiers. Performance budgets enforced in CI.

---

### Phase 6: Launch Preparation (Weeks 17-18)

**Goal**: Public beta ready. Marketing assets. Community infrastructure.

#### Week 17: Polish & Testing

| Task | Description |
|------|-------------|
| **17.1** E2E test suite | Playwright tests for critical flows: create workflow, execute, AI interaction, settings |
| **17.2** Unit test suite | Vitest tests for stores, utilities, condition engine, DAG executor |
| **17.3** Accessibility audit | WCAG 2.1 AA compliance check, keyboard navigation testing, screen reader testing |
| **17.4** Edge case handling | Empty states, error boundaries, offline mode, large flow handling (500+ nodes) |
| **17.5** Onboarding flow | First-run experience: welcome, API key setup, sample flow creation |

#### Week 18: Launch Infrastructure

| Task | Description |
|------|-------------|
| **18.1** Landing page | devrig.dev with download links, feature showcase, pricing |
| **18.2** Documentation site | Getting started, flow builder guide, plugin development guide, API reference |
| **18.3** Discord community | Server setup with channels: general, support, plugin-dev, showcase, feature-requests |
| **18.4** GitHub repositories | Public SDK repo, template repo, documentation repo |
| **18.5** Product Hunt preparation | Maker profile, screenshots, video demo, description |
| **18.6** Waitlist + early access | Email capture, invite system for private beta |

**Deliverable**: App ready for public beta. Landing page live. Community channels open. PH launch queued.

---

## 4. Folder Structure

```
devrig/
├── electron.vite.config.ts
├── forge.config.ts
├── package.json
├── tsconfig.json
├── tsconfig.main.json
├── tsconfig.preload.json
├── tsconfig.renderer.json
├── build/
│   └── entitlements.mac.plist
├── scripts/
│   ├── notarize.js
│   └── custom-sign.js
├── native/                          # NAPI-RS Rust modules (Phase 5+)
│   ├── Cargo.toml
│   └── src/
├── packages/
│   └── plugin-sdk/                  # @devrig/plugin-sdk
├── src/
│   ├── main/                        # Electron main process
│   │   ├── index.ts
│   │   ├── csp.ts
│   │   ├── navigation-guard.ts
│   │   ├── permissions.ts
│   │   ├── ipc-security.ts
│   │   ├── ipc/
│   │   │   ├── db-handlers.ts
│   │   │   ├── fs-handlers.ts
│   │   │   ├── ai-handlers.ts
│   │   │   └── system-handlers.ts
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   ├── statement-cache.ts
│   │   │   ├── schema.ts
│   │   │   ├── migrations/
│   │   │   └── repositories/
│   │   ├── services/
│   │   │   ├── flow-executor.ts
│   │   │   ├── condition-engine.ts
│   │   │   ├── ai-service.ts
│   │   │   ├── auto-updater.ts
│   │   │   ├── tier-manager.ts
│   │   │   ├── triggers/
│   │   │   └── actions/
│   │   ├── secrets/
│   │   │   ├── safe-storage.ts
│   │   │   ├── keytar-provider.ts
│   │   │   └── field-encryption.ts
│   │   ├── plugins/
│   │   │   ├── plugin-loader.ts
│   │   │   ├── isolate-sandbox.ts
│   │   │   ├── permissions.ts
│   │   │   └── plugin-api.ts
│   │   ├── integrations/
│   │   │   ├── linear/
│   │   │   └── github/
│   │   ├── licensing/
│   │   │   └── license-manager.ts
│   │   ├── telemetry/
│   │   │   ├── sentry.ts
│   │   │   └── analytics.ts
│   │   └── templates/
│   ├── preload/
│   │   ├── index.ts
│   │   └── api.ts
│   └── renderer/                    # React app (Feature-Sliced Design)
│       ├── index.html
│       ├── main.tsx
│       ├── app/
│       │   ├── index.tsx
│       │   ├── providers/
│       │   ├── router/
│       │   ├── bootstrap.ts
│       │   ├── data-loader.ts
│       │   └── styles/
│       │       ├── globals.css
│       │       ├── tokens.css
│       │       └── themes/
│       ├── pages/
│       │   ├── dashboard/
│       │   ├── flow-editor/
│       │   ├── execution-history/
│       │   ├── settings/
│       │   └── plugins/
│       ├── widgets/
│       │   ├── sidebar/
│       │   ├── flow-canvas/
│       │   ├── node-palette/
│       │   ├── property-panel/
│       │   ├── execution-panel/
│       │   ├── ai-assistant/
│       │   └── command-palette/
│       ├── features/
│       │   ├── create-node/
│       │   ├── execute-flow/
│       │   ├── configure-node/
│       │   ├── import-export/
│       │   ├── ai-generate/
│       │   ├── undo-redo/
│       │   ├── oauth/
│       │   ├── licensing/
│       │   └── templates/
│       ├── entities/
│       │   ├── flow/
│       │   ├── node/
│       │   ├── edge/
│       │   ├── execution/
│       │   ├── workspace/
│       │   └── ai-model/
│       └── shared/
│           ├── ui/                  # shadcn/ui components
│           ├── lib/
│           ├── hooks/
│           ├── types/
│           └── config/
├── resources/
│   ├── icon.icns
│   ├── icon.ico
│   └── icon.png
├── tests/
│   ├── unit/
│   ├── component/
│   ├── e2e/
│   └── performance/
└── .github/
    └── workflows/
        ├── ci.yml
        ├── release.yml
        └── performance.yml
```

---

## 5. Database Schema (Core Tables)

```sql
-- Workspaces
CREATE TABLE workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  settings TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Workflows
CREATE TABLE workflows (
  id TEXT PRIMARY KEY,
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft',
  trigger_config TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Flow Nodes
CREATE TABLE flow_nodes (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  label TEXT NOT NULL DEFAULT '',
  x REAL NOT NULL DEFAULT 0,
  y REAL NOT NULL DEFAULT 0,
  config TEXT DEFAULT '{}',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Flow Edges
CREATE TABLE flow_edges (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  source_node_id TEXT NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
  target_node_id TEXT NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
  source_handle TEXT,
  target_handle TEXT,
  label TEXT DEFAULT '',
  created_at INTEGER NOT NULL
);

-- Executions
CREATE TABLE executions (
  id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  status TEXT NOT NULL DEFAULT 'pending',
  trigger_type TEXT NOT NULL,
  started_at INTEGER,
  completed_at INTEGER,
  error TEXT,
  created_at INTEGER NOT NULL
);

-- Execution Steps
CREATE TABLE execution_steps (
  id TEXT PRIMARY KEY,
  execution_id TEXT NOT NULL REFERENCES executions(id) ON DELETE CASCADE,
  node_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT,
  output TEXT,
  error TEXT,
  started_at INTEGER,
  completed_at INTEGER,
  duration_ms INTEGER
);

-- Secrets (encrypted)
CREATE TABLE secrets (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  encrypted_value TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'safeStorage',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Plugins
CREATE TABLE plugins (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  version TEXT NOT NULL,
  manifest TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  installed_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Settings (key-value)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX idx_workflows_workspace ON workflows(workspace_id, updated_at DESC);
CREATE INDEX idx_flow_nodes_workflow ON flow_nodes(workflow_id);
CREATE INDEX idx_flow_edges_source ON flow_edges(source_node_id);
CREATE INDEX idx_flow_edges_target ON flow_edges(target_node_id);
CREATE INDEX idx_executions_workflow ON executions(workflow_id, started_at DESC);
CREATE INDEX idx_execution_steps_execution ON execution_steps(execution_id);
```

---

## 6. Build Agent Strategy

When implementation begins, the following agents will be launched in sequence (some in parallel where independent):

### Wave 1 (Parallel) - Foundation
- **Agent A**: Project scaffold (Task 1.1-1.6) - Electron shell, config files, security
- **Agent B**: Database layer (Task 2.1-2.5) - SQLite, schema, repositories, IPC handlers
- **Agent C**: Design system (Task 2.6-2.7) - shadcn/ui, tokens, core components

### Wave 2 (Parallel) - Layout & State
- **Agent D**: App layout + sidebar (Task 3.1-3.2) - Resizable panels, navigation
- **Agent E**: State management (Task 3.3-3.7) - Zustand stores, optimistic updates, data loading
- **Agent F**: Dashboard page (Task 3.8) - Flow list, virtual scrolling

### Wave 3 (Parallel) - Flow Builder
- **Agent G**: React Flow canvas + custom nodes (Task 4.1-4.6) - Visual flow builder
- **Agent H**: Execution engine (Task 5.3-5.6) - DAG executor, triggers, actions
- **Agent I**: Node configuration UI (Task 5.1-5.2) - Property panel, config forms

### Wave 4 (Parallel) - AI & UX
- **Agent J**: AI integration (Task 7.1-7.6) - Claude API, AI nodes, MCP
- **Agent K**: Command palette + shortcuts (Task 8.1-8.6) - cmdk, keyboard system
- **Agent L**: Execution UI (Task 6.1-6.6) - Timeline, history, visualization

### Wave 5 (Parallel) - Integrations
- **Agent M**: Linear integration (Task 10.1-10.5)
- **Agent N**: GitHub integration (Task 11.1-11.4)
- **Agent O**: Plugin system (Task 12.1-12.6)

### Wave 6 (Sequential) - Production
- **Agent P**: Code signing + CI/CD (Task 14.1-14.5)
- **Agent Q**: Licensing + telemetry (Task 15.1-15.5)
- **Agent R**: Performance optimization (Task 16.1-16.6)

---

## 7. Key Architecture Decisions

| Decision | Choice | Alternative Considered | Rationale |
|----------|--------|----------------------|-----------|
| Desktop framework | Electron | Tauri | User preference; Node.js ecosystem; Cursor/VSCode precedent |
| UI framework | React 19 + Compiler | Solid, Svelte | Ecosystem (React Flow, cmdk, shadcn); hiring pool |
| State management | Zustand | MobX, Jotai | Natural React integration; Compiler compatible |
| Flow builder | @xyflow/react v12 | Rete.js | 50x more downloads; better React integration |
| Database | SQLite + better-sqlite3 | IndexedDB, PouchDB | Synchronous reads; WAL mode; no external deps |
| Plugin sandbox | isolated-vm | vm2, QuickJS-WASM | V8-native speed; process-level isolation; no CVEs |
| Secrets | Electron safeStorage | keytar-only | Built-in; OS keychain delegation; no native rebuild |
| Licensing | Keygen.sh | Lemon Squeezy | SOC 2; offline grace; Electron-native integration |
| Design system | shadcn/ui + Radix | Ark UI, MUI | Copy-to-project ownership; Linear uses same stack |
| Animations | Motion | CSS transitions | Spring physics; WAAPI hybrid; layout animations |
| Architecture | Feature-Sliced Design | Atomic Design | Strict layer boundaries; unidirectional imports |

---

## 8. Risk Mitigation Checklist

- [ ] **vm2 explicitly banned** - CVE-2026-22709 (CVSS 9.8). Use isolated-vm only.
- [ ] **nodeIntegration: false** enforced on ALL BrowserWindows
- [ ] **contextIsolation: true** enforced on ALL BrowserWindows
- [ ] **IPC channel whitelist** - No raw ipcRenderer exposure
- [ ] **CSP enforced** both via meta tag and programmatic headers
- [ ] **Secrets never in localStorage** - safeStorage or keychain only
- [ ] **Basic_text backend detection** on Linux - refuse to store secrets
- [ ] **Auto-update signature verification** - electron-builder 24.0+
- [ ] **SBOM generated** on every release
- [ ] **npm audit** in CI - fail on high/critical
- [ ] **Performance budgets** enforced in CI - fail build on regression

---

## 9. Revenue Path Summary

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | 3 flows, 100 runs/mo, community plugins |
| Pro | $19/mo | Unlimited flows, 2000 runs/mo, AI (500 actions), all plugins |
| Team | $39/user/mo | Pro + shared flows, team templates, SSO, 5000 runs/user |
| Enterprise | Custom | Self-hosted, unlimited, custom integrations, SLA |

**$1M ARR target**: ~3,100-4,400 paying users (achievable within 9-12 months based on comparable growth curves).

---

## 10. Source Documents

This plan synthesizes findings from:

1. **DevRig_Business_Analysis.md** - Market research, pricing, GTM, competitive analysis (726 lines, 60+ sources)
2. **DEVRIG_FRONTEND_ARCHITECTURE.md** - UI framework, state management, design system, animations (1,210 lines, 50+ sources)
3. **devrig-backend-architecture.md** - Execution engine, database, plugins, AI integration (~2,500 lines)
4. **devrig-security-architecture.md** - Threat model, Electron security, secrets, code signing, compliance (1,798 lines, 25+ sources)
5. **devrig-performance-architecture.md** - Performance budgets, startup, rendering, memory, NAPI-RS (2,332 lines, 30+ sources)

---

*This is the master implementation plan for DevRig. Phases 1-3 (Weeks 1-9) produce a functional MVP. Phase 4 (Weeks 10-13) adds integrations and extensibility. Phases 5-6 (Weeks 14-18) prepare for commercial launch.*
