# DevRig: Master Implementation Plan

**Version**: 2.0 | **Date**: 2026-02-11
**Status**: Revised — Developer Command Center Direction

---

## Executive Summary

DevRig is a commercial Electron desktop application that serves as an **AI-powered developer command center**. It unifies all the tools a developer interacts with daily — email, project management, code review, monitoring, and more — into a single, intelligent hub powered by AI.

**Core Thesis**: Developers context-switch between 8-12 tools daily (Gmail, Linear, Jira, GitHub, Slack, Datadog, Sentry, etc.). No tool unifies them with AI intelligence. DevRig is the single pane of glass where AI classifies, prioritizes, and acts on information from all your tools — so you see only what matters, with drafts and plans ready to go.

**Architecture**: Plugin-first. Every integration (Gmail, GitHub, Linear, Datadog) is a plugin. The app without plugins is a shell with an AI brain. AI providers (Claude first, then OpenAI, Gemini, local models) are also plugins. A visual flow builder enables custom cross-plugin automations for power users.

**Primary UI**: A unified inbox/dashboard showing priority-sorted items from all connected plugins — emails classified by importance, sprint tickets pre-planned, PRs ready for review, alerts analyzed. Think Linear's inbox meets Superhuman, but for everything.

**Target**: $1M ARR within 12 months via freemium model ($19/mo Pro, $39/user/mo Team).

---

## 1. Unified Technology Stack

### Core Platform

| Layer | Technology | Version | Rationale |
|-------|-----------|---------|-----------|
| **Desktop Runtime** | Electron | 34+ | Chromium 132+, Node.js 22+; Cursor/VSCode precedent |
| **Build Tool** | electron-vite | 5.0 | Purpose-built for Electron; V8 bytecode; HMR |
| **Packaging** | Electron Forge | 7.7+ | .dmg, .exe, .AppImage; code signing integration |
| **Language** | TypeScript | 5.7+ | Strict mode across all processes |

### Frontend (Renderer Process)

| Component | Technology | Version | Rationale |
|-----------|-----------|---------|-----------|
| **UI Framework** | React 19 + React Compiler | 19.1+ | Automatic memoization; largest ecosystem |
| **Flow Builder** | @xyflow/react | 12.10+ | 1.15M weekly downloads; viewport-based rendering |
| **State Management** | Zustand + Immer + Zundo | 5.0+ | Centralized stores; immutable updates; undo/redo |
| **Design System** | shadcn/ui + Radix UI | 1.2+ | Copy-to-project; full ownership; accessibility |
| **CSS** | Tailwind CSS v4 | 4.1+ | @theme directive; CSS-first design tokens |
| **Animations** | Motion | 12.4+ | WAAPI hybrid engine; spring physics |
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
| **AI Integration** | Claude API + Agent SDK | Latest | First-class AI provider; multi-model abstraction |
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
|  ├── Unified Inbox (primary UI — priority-sorted feed)            |
|  ├── Plugin View Registry (plugins register custom views)         |
|  ├── Flow Builder (@xyflow/react — power user automations)        |
|  ├── Feature-Sliced Design (6 layers)                             |
|  ├── Zustand stores (in-memory state, Tier 1)                     |
|  ├── shadcn/ui + Tailwind v4 (design system)                     |
|  ├── cmdk (command palette)                                       |
|  └── Motion (animations)                                          |
|                                                                    |
+------------------------------|-------------------------------------+
                               | IPC (invoke/handle, channel whitelist)
+------------------------------|-------------------------------------+
|  MAIN PROCESS (Node.js - Coordinator)                             |
|                                                                    |
|  ├── Plugin Manager (lifecycle, permissions, registry)            |
|  ├── AI Provider Layer (Claude → OpenAI → Gemini → local)         |
|  ├── AI Pipeline Engine (classify, summarize, draft, plan)        |
|  ├── Plugin Data Sync Scheduler (polling, webhooks)               |
|  ├── IPC router (validates sender, routes to workers)             |
|  ├── Window management & app lifecycle                            |
|  ├── Auto-updater & license validation                            |
|  └── System tray                                                  |
|                                                                    |
+----------|----------------|----------------|----------------------+
           |                |                |
    +------v------+  +------v------+  +------v------+
    | Database    |  | Hidden      |  | Worker      |
    | (Main Proc) |  | Window      |  | Threads     |
    |             |  | (Execution) |  | (CPU tasks) |
    | SQLite WAL  |  | Workflow    |  | Sync engine |
    | better-     |  | execution   |  | Data xform  |
    | sqlite3     |  | Plugin      |  | Search      |
    | Drizzle ORM |  | sandbox     |  | indexing    |
    +-------------+  +-------------+  +-------------+
```

### Plugin-First Architecture

Everything is a plugin. The core app provides:
1. **Plugin runtime** — lifecycle, sandbox, permissions, IPC bridge
2. **AI provider abstraction** — multi-model routing, cost tracking
3. **Unified inbox** — renders items from all plugins in a priority-sorted feed
4. **Flow builder** — visual automation canvas for cross-plugin workflows
5. **Data layer** — SQLite storage, sync scheduling, secrets management

Plugins provide:
1. **Data sources** — fetch emails, tickets, PRs, alerts from external services
2. **AI pipelines** — classification rules, prompt templates, drafting logic
3. **Actions** — reply to email, assign ticket, approve PR, acknowledge alert
4. **Views** — custom UI panels registered in the dashboard
5. **Flow nodes** — custom trigger/action/condition nodes for the flow builder

### AI Provider Abstraction

```
┌─────────────────────────────────────────────┐
│  AI Provider Interface                       │
│  ├── complete(prompt, options) → response    │
│  ├── stream(prompt, options) → stream        │
│  ├── classify(items, schema) → labels        │
│  ├── summarize(content) → summary            │
│  └── draft(context, intent) → text           │
├─────────────────────────────────────────────┤
│  Providers (plugins):                        │
│  ├── Claude (default, first-class)           │
│  ├── OpenAI (GPT-4o, o3)                    │
│  ├── Google Gemini                           │
│  ├── Local (Ollama, LM Studio)              │
│  └── Custom endpoint                         │
├─────────────────────────────────────────────┤
│  Model Router:                               │
│  ├── Per-task model selection                │
│  ├── Cost tracking per operation             │
│  ├── Rate limiting & quota management        │
│  ├── Fallback chain (Claude → OpenAI → local)│
│  └── User-provided API keys support          │
└─────────────────────────────────────────────┘
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

### Phase 1: Foundation (Weeks 1-3) ✅ COMPLETE

**Goal**: Bootable Electron app with project scaffolding, design system, and database layer.

**Delivered**:
- Electron shell with full security hardening (CSP, IPC whitelist, sandbox)
- SQLite database with WAL mode, 9 tables, repository layer
- React 19 + Tailwind v4 + shadcn/ui design system (15+ components)
- Feature-Sliced Design architecture
- Zustand + Immer + Zundo state management
- App layout with sidebar, dashboard, state-based router

---

### Phase 2: Plugin SDK Core & AI Provider Layer (Weeks 4-6)

**Goal**: Plugin runtime that can load, sandbox, and manage plugins. AI provider abstraction with Claude as first provider.

#### Week 4: Plugin Architecture

| Task | Description | Files |
|------|-------------|-------|
| **4.1** Plugin manifest schema | JSON schema for plugin declarations: id, name, version, permissions, capabilities (dataSources, actions, views, flowNodes, aiPipelines) | `src/main/plugins/manifest-schema.ts` |
| **4.2** Plugin loader | Discover plugins from plugin directory, validate manifests, register capabilities | `src/main/plugins/plugin-loader.ts` |
| **4.3** isolated-vm sandbox | V8 isolate per plugin, 128MB memory, 5s timeout, capability-gated host functions | `src/main/plugins/isolate-sandbox.ts` |
| **4.4** Plugin permission model | Permission types: network (domain allowlist), secrets (read specific keys), filesystem (path restrictions), AI (model access) | `src/main/plugins/permissions.ts` |
| **4.5** Plugin API surface | Host functions exposed to plugins: `log`, `fetch`, `getSecret`, `storeItems`, `queryItems`, `emitEvent`, `requestAI` | `src/main/plugins/plugin-api.ts` |
| **4.6** Plugin lifecycle manager | Install, enable, disable, uninstall, update. Plugin state persisted to DB | `src/main/plugins/plugin-manager.ts` |

#### Week 5: AI Provider Abstraction

| Task | Description | Files |
|------|-------------|-------|
| **5.1** AI provider interface | TypeScript interface: complete(), stream(), classify(), summarize(), draft() | `src/main/ai/provider-interface.ts` |
| **5.2** Claude provider | First-class Claude API integration with streaming, model selection (Opus/Sonnet/Haiku) | `src/main/ai/providers/claude-provider.ts` |
| **5.3** Model router | Per-task model selection, fallback chains, cost tracking per operation | `src/main/ai/model-router.ts` |
| **5.4** AI pipeline engine | Composable pipelines: classify → filter → summarize → draft. Plugins register pipeline definitions | `src/main/ai/pipeline-engine.ts` |
| **5.5** Cost tracker | Track token usage per provider, per plugin, per pipeline. Enforce tier limits | `src/main/ai/cost-tracker.ts` |
| **5.6** Secrets management | safeStorage integration for API keys, AES-256-GCM field encryption for plugin credentials | `src/main/secrets/` |

#### Week 6: Plugin Data Model & IPC

| Task | Description | Files |
|------|-------------|-------|
| **6.1** Inbox items table | Unified schema for items from all plugins: id, plugin_id, type, title, body, priority, status, metadata, ai_classification, source_url, created_at | `src/main/db/schema.ts` update |
| **6.2** Plugin data source contract | Interface for plugins to push items: `storeItems(items[])`, `queryItems(filter)`, `markRead(ids[])`, `archive(ids[])` | Plugin API extension |
| **6.3** Data sync scheduler | Background scheduler for plugin data fetches. Configurable intervals per plugin. SQLite-backed job queue | `src/main/services/sync-scheduler.ts` |
| **6.4** Plugin IPC handlers | IPC channels for renderer to interact with plugins: `plugin:list`, `plugin:install`, `plugin:configure`, `plugin:getItems` | `src/main/ipc/plugin-handlers.ts` |
| **6.5** AI IPC handlers | IPC channels for AI operations: `ai:classify`, `ai:summarize`, `ai:draft`, `ai:complete`, `ai:getProviders`, `ai:getUsage` | `src/main/ipc/ai-handlers.ts` |
| **6.6** Plugin SDK package | `@devrig/plugin-sdk` npm package with types, helpers, example plugin scaffold | `packages/plugin-sdk/` |

**Deliverable**: Plugin runtime loads and sandboxes plugins. Claude AI provider works. Plugins can fetch data, store items, and request AI operations. SDK published for plugin development.

---

### Phase 3: Unified Inbox & Dashboard (Weeks 7-9)

**Goal**: The primary UI — a unified inbox showing AI-classified items from all connected plugins, with inline actions.

#### Week 7: Inbox Core

| Task | Description | Files |
|------|-------------|-------|
| **7.1** Inbox page | Primary page replacing dashboard. Priority-sorted feed of items from all plugins. Grouped by plugin or time | `src/renderer/pages/inbox/` |
| **7.2** Inbox store | Zustand store for inbox items, filters, sorting, read/unread state, AI classifications | `src/renderer/entities/inbox-item/model/inbox-store.ts` |
| **7.3** Inbox item component | Versatile item renderer: shows plugin icon, title, AI summary, priority badge, quick actions. Expandable detail view | `src/renderer/entities/inbox-item/ui/InboxItem.tsx` |
| **7.4** AI classification display | Show AI-assigned labels (Important, Needs Response, FYI, Spam), confidence scores, reasoning on hover | Integrated into InboxItem |
| **7.5** Inbox filters | Filter by: plugin, priority, status (unread/read/archived), AI classification, date range | `src/renderer/features/inbox-filter/` |
| **7.6** Virtual scrolling | TanStack Virtual for inbox list — must handle 1000+ items at 60fps | Inbox page integration |

#### Week 8: Inline Actions & Plugin Views

| Task | Description | Files |
|------|-------------|-------|
| **8.1** Inline action system | Actions registered by plugins, rendered as buttons/menus on inbox items (Reply, Assign, Approve, Acknowledge) | `src/renderer/features/inbox-actions/` |
| **8.2** Action execution | Execute plugin actions via IPC, show loading/success/error states, optimistic UI updates | Action system integration |
| **8.3** AI draft panel | When an item needs a response, show AI-generated draft. User can edit, approve, or regenerate | `src/renderer/widgets/ai-draft-panel/` |
| **8.4** Plugin view registry | Plugins can register custom view components. Views appear as tabs/panels in the dashboard | `src/renderer/app/plugin-views.ts` |
| **8.5** Detail panel | Right-side panel showing full item detail when selected. Plugin provides the detail view component | `src/renderer/widgets/detail-panel/` |
| **8.6** Notification system | Background sync produces new items → badge count on tray icon, toast notification for high-priority items | Tray + notification integration |

#### Week 9: Command Palette & Settings

| Task | Description | Files |
|------|-------------|-------|
| **9.1** Command palette | cmdk integration with global Cmd+K. Searches across: inbox items, plugins, actions, flows, settings | `src/renderer/widgets/command-palette/` |
| **9.2** Keyboard shortcut system | Global shortcut registry, platform-aware modifiers, context-sensitive | `src/renderer/shared/lib/shortcuts.ts` |
| **9.3** Settings page | Tabs: General, AI Models, Plugins, Connections, Keyboard Shortcuts, About | `src/renderer/pages/settings/` |
| **9.4** Plugin configuration UI | Per-plugin settings: API keys, sync intervals, AI pipeline options, permissions review | Settings integration |
| **9.5** AI model settings | Configure providers, select default model per task type, view usage/costs, manage API keys | Settings integration |
| **9.6** Onboarding flow | First-run: welcome → choose plugins → configure API keys → first sync → see inbox populate | `src/renderer/features/onboarding/` |

**Deliverable**: Unified inbox shows items from plugins, AI-classified and priority-sorted. Inline actions work. Command palette for keyboard-first UX. Settings and onboarding complete.

---

### Phase 4: First-Party Plugins (Weeks 10-13)

**Goal**: Ship the first wave of plugins that demonstrate the platform's value. Each plugin follows the plugin SDK contract.

#### Week 10: Gmail Plugin

| Task | Description | Files |
|------|-------------|-------|
| **10.1** Gmail OAuth2 flow | Google OAuth2 with PKCE, offline refresh tokens, stored via safeStorage | `plugins/gmail/auth.ts` |
| **10.2** Email data source | Fetch new emails via Gmail API, map to inbox items, incremental sync via history ID | `plugins/gmail/data-source.ts` |
| **10.3** AI email pipeline | Classify emails (Important/Needs Reply/FYI/Spam), summarize threads, draft replies | `plugins/gmail/ai-pipeline.ts` |
| **10.4** Email actions | Reply (with AI draft), archive, label, snooze, mark important | `plugins/gmail/actions.ts` |
| **10.5** Email detail view | Full email thread view with conversation, attachments, AI summary sidebar | `plugins/gmail/views/` |

#### Week 11: GitHub Plugin

| Task | Description | Files |
|------|-------------|-------|
| **11.1** GitHub OAuth/PAT auth | GitHub App or PAT authentication, stored via safeStorage | `plugins/github/auth.ts` |
| **11.2** GitHub data sources | PRs (assigned, review requested), Issues (assigned, mentioned), CI status, notifications | `plugins/github/data-source.ts` |
| **11.3** AI code review pipeline | Analyze PR diffs, identify issues, suggest improvements, summarize changes | `plugins/github/ai-pipeline.ts` |
| **11.4** GitHub actions | Approve PR, request changes, comment, merge, assign, label, close issue | `plugins/github/actions.ts` |
| **11.5** PR review view | Diff viewer with AI annotations, inline comments, approval controls | `plugins/github/views/` |

#### Week 12: Linear / Jira / ClickUp Plugin

| Task | Description | Files |
|------|-------------|-------|
| **12.1** Linear OAuth2 flow | Linear API authentication + webhook registration | `plugins/linear/auth.ts` |
| **12.2** Ticket data sources | Assigned tickets in current cycle/sprint, updated issues, comments/mentions | `plugins/linear/data-source.ts` |
| **12.3** AI sprint planning pipeline | Pull assigned tickets, analyze requirements, break into subtasks, estimate complexity, suggest implementation plan | `plugins/linear/ai-pipeline.ts` |
| **12.4** Ticket actions | Update status, assign, comment, create sub-issue, change priority, move to cycle | `plugins/linear/actions.ts` |
| **12.5** Jira adapter | Same plugin contract, Jira REST API backend. Shared UI with Linear plugin | `plugins/jira/` |
| **12.6** ClickUp adapter | Same plugin contract, ClickUp API backend | `plugins/clickup/` |

#### Week 13: Flow Builder + Cross-Plugin Automations

| Task | Description | Files |
|------|-------------|-------|
| **13.1** Flow builder page | Visual flow builder using @xyflow/react (already partially built). Refine for cross-plugin flows | `src/renderer/pages/flow-editor/` (existing, enhanced) |
| **13.2** Plugin flow nodes | Plugins register custom trigger/action/condition nodes for the flow builder | Plugin SDK extension |
| **13.3** Cross-plugin triggers | Trigger on: new email matching filter, PR opened, ticket assigned, alert fired | Trigger system integration |
| **13.4** Cross-plugin actions | Actions from any plugin can be nodes: reply to email, update ticket, comment on PR | Action system integration |
| **13.5** Flow templates | Pre-built templates: "Email → AI Classify → Draft Reply", "PR Opened → AI Review → Comment", "Ticket Assigned → AI Plan → Create Subtasks" | `src/main/templates/` |
| **13.6** Execution history | Execution history page for flow runs (existing, enhanced) | `src/renderer/pages/execution-history/` |

**Deliverable**: Gmail, GitHub, and Linear/Jira/ClickUp plugins working end-to-end. Cross-plugin flows enabled. AI classifies, summarizes, and drafts across all integrations.

---

### Phase 5: Monitoring Plugins & Multi-Model AI (Weeks 14-16)

**Goal**: Monitoring integrations. Multi-model AI support. Advanced AI capabilities.

#### Week 14: Monitoring Plugins

| Task | Description | Files |
|------|-------------|-------|
| **14.1** Sentry plugin | Fetch errors, AI-analyze stack traces, group by root cause, suggest fixes | `plugins/sentry/` |
| **14.2** Datadog plugin | Fetch alerts/monitors, AI-correlate with recent deployments, suggest remediation | `plugins/datadog/` |
| **14.3** CloudWatch plugin | Fetch alarms, AI-analyze metrics, correlate with recent changes | `plugins/cloudwatch/` |
| **14.4** Monitoring dashboard view | Unified monitoring view across all providers: error rates, alert status, AI insights | Plugin view integration |

#### Week 15: Multi-Model AI & Advanced AI

| Task | Description | Files |
|------|-------------|-------|
| **15.1** OpenAI provider plugin | GPT-4o, o3 integration via AI provider interface | `plugins/openai-provider/` |
| **15.2** Google Gemini provider plugin | Gemini Pro/Flash integration | `plugins/gemini-provider/` |
| **15.3** Local model provider plugin | Ollama, LM Studio integration for offline/free AI | `plugins/local-provider/` |
| **15.4** AI agent mode | Long-running autonomous workflows: AI plans → executes → reports. Human-in-the-loop approval gates | `src/main/ai/agent-mode.ts` |
| **15.5** AI context management | Smart context injection: what data gets sent to AI per plugin, truncation strategy, token budget management | `src/main/ai/context-manager.ts` |

#### Week 16: Plugin Marketplace & Ecosystem

| Task | Description | Files |
|------|-------------|-------|
| **16.1** Plugin marketplace UI | Browse, search, install plugins. Ratings, download counts, plugin detail pages | `src/renderer/pages/plugin-marketplace/` |
| **16.2** Plugin publishing flow | `devrig publish` CLI command, manifest validation, plugin registry API | `packages/plugin-cli/` |
| **16.3** Community plugin support | Documentation site, plugin development guide, example plugins | External docs |
| **16.4** Plugin revenue sharing | 70/30 split for premium plugins. Stripe integration for payouts | Marketplace backend |

**Deliverable**: Monitoring plugins provide error/alert visibility. Multiple AI models supported. Plugin marketplace enables community growth.

---

### Phase 6: Production Hardening (Weeks 17-19)

**Goal**: Code signing, licensing, auto-update, performance optimization, crash reporting.

#### Week 17: Code Signing & Distribution

| Task | Description | Files |
|------|-------------|-------|
| **17.1** macOS code signing | Apple Developer ID, hardened runtime, entitlements, notarization | `build/entitlements.mac.plist`, `scripts/notarize.js` |
| **17.2** Windows code signing | EV certificate, Authenticode, SHA-256, timestamp | `scripts/custom-sign.js` |
| **17.3** Linux packaging | .deb + .rpm + .AppImage with GPG signatures | Forge config |
| **17.4** GitHub Actions CI/CD | Multi-platform build pipeline, SBOM generation | `.github/workflows/release.yml` |
| **17.5** Auto-updater | electron-updater, signature verification, staged rollout | `src/main/services/auto-updater.ts` |

#### Week 18: Licensing & Telemetry

| Task | Description | Files |
|------|-------------|-------|
| **18.1** License manager | Keygen.sh integration, machine fingerprint, offline validation, 30-day grace | `src/main/licensing/` |
| **18.2** License UI | Activation dialog, license status, tier indicator | `src/renderer/features/licensing/` |
| **18.3** Free tier enforcement | 3 plugins, 100 AI actions/mo, 5 flows. Upgrade triggers | `src/main/services/tier-manager.ts` |
| **18.4** Sentry crash reporting | Opt-in, PII scrubbing, main + renderer initialization | `src/main/telemetry/sentry.ts` |
| **18.5** PostHog analytics | Opt-in, anonymous, allowlisted properties | `src/main/telemetry/analytics.ts` |

#### Week 19: Performance Optimization

| Task | Description | Files |
|------|-------------|-------|
| **19.1** V8 bytecode compilation | electron-vite bytecodePlugin for main + preload | `electron.vite.config.ts` update |
| **19.2** Deferred module loading | Tiered imports: critical first, plugins deferred | Main process refactor |
| **19.3** Plugin loading optimization | Lazy-load plugin sandboxes, pool isolates, cache compiled bytecode | Plugin system optimization |
| **19.4** Performance marks | Instrument startup, IPC latency, inbox render time, AI response time | `src/renderer/shared/lib/perf-marks.ts` |
| **19.5** CI performance tests | Playwright-driven startup time, memory, FPS tests that fail build on regression | `tests/performance/` |
| **19.6** Memory management | ScopedIPC cleanup, WeakRef caches, GC hints, memory monitor | Various files |

**Deliverable**: Signed, notarized, auto-updating app. Licensed with free/pro tiers. Performance budgets enforced.

---

### Phase 7: Launch (Weeks 20-21)

**Goal**: Public beta ready. Marketing assets. Community.

#### Week 20: Polish & Testing

| Task | Description |
|------|-------------|
| **20.1** E2E test suite | Playwright tests: onboarding, inbox, plugin install, AI classification, flow execution |
| **20.2** Unit test suite | Vitest: stores, AI pipelines, plugin loader, condition engine, sync scheduler |
| **20.3** Accessibility audit | WCAG 2.1 AA, keyboard navigation, screen reader testing |
| **20.4** Edge cases | Empty states, error boundaries, offline mode, large inbox handling (10K+ items) |
| **20.5** Plugin QA | Test all first-party plugins against real accounts: Gmail, GitHub, Linear, Sentry |

#### Week 21: Launch Infrastructure

| Task | Description |
|------|-------------|
| **21.1** Landing page | devrig.dev with download, feature showcase, plugin gallery, pricing |
| **21.2** Documentation site | Getting started, plugin development guide, AI pipeline guide, API reference |
| **21.3** Discord community | Channels: general, support, plugin-dev, showcase, feature-requests |
| **21.4** GitHub repositories | Public SDK repo, plugin template, example plugins, documentation |
| **21.5** Product Hunt launch | Maker profile, screenshots, video demo, description |
| **21.6** Waitlist + early access | Email capture, invite system for private beta |

**Deliverable**: App ready for public beta. Landing page live. Community open. PH launch queued.

---

## 4. Plugin Architecture Detail

### Plugin Manifest Schema

```json
{
  "id": "devrig-gmail",
  "name": "Gmail",
  "version": "1.0.0",
  "description": "AI-powered email management",
  "author": "DevRig",
  "icon": "./icon.svg",
  "permissions": {
    "network": ["gmail.googleapis.com", "oauth2.googleapis.com"],
    "secrets": ["gmail-oauth-token"],
    "ai": true
  },
  "capabilities": {
    "dataSources": [{
      "id": "emails",
      "name": "Emails",
      "syncInterval": 60,
      "entryPoint": "./data-source.js"
    }],
    "actions": [{
      "id": "reply",
      "name": "Reply",
      "icon": "reply",
      "entryPoint": "./actions.js#reply"
    }, {
      "id": "archive",
      "name": "Archive",
      "entryPoint": "./actions.js#archive"
    }],
    "aiPipelines": [{
      "id": "classify-emails",
      "name": "Classify Emails",
      "trigger": "onNewItems",
      "entryPoint": "./ai-pipeline.js#classify"
    }, {
      "id": "draft-reply",
      "name": "Draft Reply",
      "trigger": "onAction:reply",
      "entryPoint": "./ai-pipeline.js#draftReply"
    }],
    "views": [{
      "id": "email-detail",
      "name": "Email Thread",
      "type": "detail",
      "entryPoint": "./views/email-detail.js"
    }],
    "flowNodes": [{
      "type": "trigger",
      "id": "new-email",
      "name": "New Email",
      "configSchema": { "filter": "string" }
    }, {
      "type": "action",
      "id": "send-email",
      "name": "Send Email",
      "configSchema": { "to": "string", "subject": "string", "body": "string" }
    }]
  }
}
```

### Plugin Capability Types

| Capability | Purpose | Example |
|-----------|---------|---------|
| **Data Source** | Fetches items from external service, stores in unified inbox | Gmail: fetch emails, GitHub: fetch PRs |
| **Action** | Performs an operation on an item or external service | Reply to email, merge PR, assign ticket |
| **AI Pipeline** | Defines how AI processes items from this plugin | Classify email importance, summarize PR changes |
| **View** | Custom UI component rendered in the app | Email thread viewer, PR diff viewer |
| **Flow Node** | Custom node for the visual flow builder | "New Email" trigger, "Send Email" action |

### Plugin Lifecycle

```
Install → Validate Manifest → Request Permissions → Initialize Sandbox
    → Register Capabilities → Start Data Sync → Active
    → Disable → Stop Sync → Suspend Sandbox
    → Uninstall → Cleanup Data → Remove
```

---

## 5. Unified Inbox Data Model

### New Tables

```sql
-- Inbox items (unified across all plugins)
CREATE TABLE inbox_items (
  id TEXT PRIMARY KEY,
  plugin_id TEXT NOT NULL REFERENCES plugins(id),
  external_id TEXT NOT NULL,              -- ID in the external system
  type TEXT NOT NULL,                     -- 'email', 'pr', 'issue', 'alert', etc.
  title TEXT NOT NULL,
  body TEXT,                              -- Full content (may be large)
  preview TEXT,                           -- Short preview for list view
  source_url TEXT,                        -- Link to item in external system
  priority INTEGER NOT NULL DEFAULT 0,    -- AI-assigned priority (0-100)
  status TEXT NOT NULL DEFAULT 'unread',  -- 'unread', 'read', 'archived', 'snoozed'
  ai_classification TEXT,                 -- JSON: { label, confidence, reasoning }
  ai_summary TEXT,                        -- AI-generated summary
  ai_draft TEXT,                          -- AI-generated draft response
  metadata TEXT DEFAULT '{}',             -- Plugin-specific metadata (JSON)
  is_actionable INTEGER DEFAULT 0,       -- Whether this item needs user action
  snoozed_until INTEGER,                 -- Timestamp for snoozed items
  external_created_at INTEGER,           -- When created in external system
  synced_at INTEGER NOT NULL,            -- Last synced from external system
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Plugin sync state
CREATE TABLE plugin_sync_state (
  plugin_id TEXT PRIMARY KEY REFERENCES plugins(id),
  last_sync_at INTEGER,
  sync_cursor TEXT,                       -- Plugin-specific cursor (e.g., Gmail historyId)
  sync_status TEXT DEFAULT 'idle',        -- 'idle', 'syncing', 'error'
  error TEXT,
  items_synced INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- AI operations log (for cost tracking)
CREATE TABLE ai_operations (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,                 -- 'claude', 'openai', 'gemini', 'local'
  model TEXT NOT NULL,                    -- 'claude-sonnet-4-5', 'gpt-4o', etc.
  operation TEXT NOT NULL,                -- 'classify', 'summarize', 'draft', 'complete'
  plugin_id TEXT REFERENCES plugins(id),
  input_tokens INTEGER NOT NULL,
  output_tokens INTEGER NOT NULL,
  cost_usd REAL,                          -- Estimated cost in USD
  duration_ms INTEGER,
  created_at INTEGER NOT NULL
);

-- Indexes
CREATE INDEX idx_inbox_items_plugin ON inbox_items(plugin_id, status, priority DESC);
CREATE INDEX idx_inbox_items_status ON inbox_items(status, priority DESC, created_at DESC);
CREATE INDEX idx_inbox_items_external ON inbox_items(plugin_id, external_id);
CREATE INDEX idx_inbox_items_snoozed ON inbox_items(snoozed_until) WHERE snoozed_until IS NOT NULL;
CREATE INDEX idx_ai_operations_plugin ON ai_operations(plugin_id, created_at DESC);
CREATE INDEX idx_ai_operations_date ON ai_operations(created_at DESC);
```

### Existing Tables (Unchanged)

```sql
-- workspaces, workflows, flow_nodes, flow_edges, executions,
-- execution_steps, secrets, plugins, settings
-- (See Phase 1 schema — no changes needed)
```

---

## 6. Folder Structure

```
devrig/
├── CLAUDE.md
├── electron.vite.config.ts
├── forge.config.ts
├── package.json
├── tsconfig.json
├── docs/
│   ├── master-plan.md                   # This file
│   ├── business-analysis.md
│   ├── frontend-architecture.md
│   ├── backend-architecture.md
│   ├── security-architecture.md
│   ├── security-architecture-extended.md
│   └── performance-architecture.md
├── src/
│   ├── main/
│   │   ├── index.ts
│   │   ├── csp.ts
│   │   ├── navigation-guard.ts
│   │   ├── permissions.ts
│   │   ├── ipc-security.ts
│   │   ├── ipc/
│   │   │   ├── db-handlers.ts
│   │   │   ├── plugin-handlers.ts       # Plugin management IPC
│   │   │   ├── ai-handlers.ts           # AI operations IPC
│   │   │   ├── execution-handlers.ts
│   │   │   └── system-handlers.ts
│   │   ├── db/
│   │   │   ├── connection.ts
│   │   │   ├── statement-cache.ts
│   │   │   ├── schema.ts               # Extended with inbox_items, sync_state, ai_operations
│   │   │   ├── migrate.ts
│   │   │   └── repositories/
│   │   │       ├── workflow.repository.ts
│   │   │       ├── node.repository.ts
│   │   │       ├── edge.repository.ts
│   │   │       ├── execution.repository.ts
│   │   │       ├── workspace.repository.ts
│   │   │       ├── settings.repository.ts
│   │   │       ├── secrets.repository.ts
│   │   │       ├── plugin.repository.ts
│   │   │       ├── inbox.repository.ts      # NEW
│   │   │       └── ai-operations.repository.ts  # NEW
│   │   ├── ai/                          # AI Provider Layer (NEW)
│   │   │   ├── provider-interface.ts    # Abstract provider contract
│   │   │   ├── model-router.ts          # Model selection & fallback
│   │   │   ├── pipeline-engine.ts       # Composable AI pipelines
│   │   │   ├── cost-tracker.ts          # Usage & cost tracking
│   │   │   ├── context-manager.ts       # Smart context injection
│   │   │   └── providers/
│   │   │       └── claude-provider.ts   # First-class Claude integration
│   │   ├── plugins/                     # Plugin System (NEW)
│   │   │   ├── manifest-schema.ts
│   │   │   ├── plugin-loader.ts
│   │   │   ├── plugin-manager.ts
│   │   │   ├── isolate-sandbox.ts
│   │   │   ├── permissions.ts
│   │   │   └── plugin-api.ts
│   │   ├── services/
│   │   │   ├── flow-executor.ts
│   │   │   ├── condition-engine.ts
│   │   │   ├── sync-scheduler.ts        # Plugin data sync scheduling (NEW)
│   │   │   ├── auto-updater.ts
│   │   │   ├── tier-manager.ts
│   │   │   ├── triggers/
│   │   │   └── actions/
│   │   ├── secrets/
│   │   │   ├── safe-storage.ts
│   │   │   └── field-encryption.ts
│   │   ├── licensing/
│   │   └── telemetry/
│   ├── preload/
│   │   ├── index.ts
│   │   └── api.ts                       # Extended with plugin & AI channels
│   └── renderer/
│       ├── index.html
│       ├── main.tsx
│       ├── app/
│       │   ├── index.tsx
│       │   ├── plugin-views.ts          # Plugin view registry (NEW)
│       │   ├── providers/
│       │   ├── router/
│       │   └── styles/
│       ├── pages/
│       │   ├── inbox/                   # PRIMARY PAGE (NEW)
│       │   │   ├── ui/InboxPage.tsx
│       │   │   └── index.ts
│       │   ├── dashboard/               # Overview/stats (secondary)
│       │   ├── flow-editor/             # Visual flow builder
│       │   ├── execution-history/
│       │   ├── settings/
│       │   └── plugin-marketplace/      # Browse & install plugins (NEW)
│       ├── widgets/
│       │   ├── sidebar/
│       │   ├── layout/
│       │   ├── detail-panel/            # Item detail side panel (NEW)
│       │   ├── ai-draft-panel/          # AI draft editor (NEW)
│       │   ├── flow-canvas/
│       │   ├── node-palette/
│       │   ├── property-panel/
│       │   ├── execution-panel/
│       │   └── command-palette/
│       ├── features/
│       │   ├── inbox-filter/            # Inbox filtering (NEW)
│       │   ├── inbox-actions/           # Inline actions on items (NEW)
│       │   ├── onboarding/              # First-run experience (NEW)
│       │   ├── configure-node/
│       │   ├── import-export/
│       │   ├── undo-redo/
│       │   └── licensing/
│       ├── entities/
│       │   ├── inbox-item/              # Unified inbox item (NEW)
│       │   │   ├── ui/InboxItem.tsx
│       │   │   ├── model/inbox-store.ts
│       │   │   ├── api/inbox-ipc.ts
│       │   │   └── index.ts
│       │   ├── plugin/                  # Plugin entity (NEW)
│       │   │   ├── ui/PluginCard.tsx
│       │   │   ├── model/plugin-store.ts
│       │   │   └── index.ts
│       │   ├── ai-provider/             # AI provider entity (NEW)
│       │   │   ├── model/ai-store.ts
│       │   │   └── index.ts
│       │   ├── flow/
│       │   ├── node/
│       │   ├── edge/
│       │   ├── execution/
│       │   └── workspace/
│       └── shared/
│           ├── ui/
│           ├── lib/
│           ├── hooks/
│           ├── types/
│           └── config/
├── plugins/                             # First-party plugins (NEW)
│   ├── gmail/
│   ├── github/
│   ├── linear/
│   ├── jira/
│   ├── clickup/
│   ├── sentry/
│   ├── datadog/
│   ├── cloudwatch/
│   ├── openai-provider/
│   ├── gemini-provider/
│   └── local-provider/
├── packages/
│   ├── plugin-sdk/                      # @devrig/plugin-sdk
│   └── plugin-cli/                      # devrig publish CLI
├── native/
├── tests/
├── resources/
└── .github/workflows/
```

---

## 7. Build Agent Strategy

### Wave 1 (Foundation — COMPLETE)
- Electron shell, database, design system, layout, state management

### Wave 2 (Parallel) — Plugin & AI Core
- **Agent A**: Plugin system (manifest, loader, sandbox, permissions, lifecycle) — Tasks 4.1-4.6
- **Agent B**: AI provider layer (interface, Claude provider, router, pipelines, cost tracking) — Tasks 5.1-5.6
- **Agent C**: Secrets management + data model extensions (inbox tables, sync state) — Tasks 5.6, 6.1-6.3

### Wave 3 (Parallel) — Unified Inbox
- **Agent D**: Inbox page + store + item components — Tasks 7.1-7.6
- **Agent E**: Inline actions + AI draft panel + detail panel — Tasks 8.1-8.5
- **Agent F**: Command palette + shortcuts + settings — Tasks 9.1-9.5

### Wave 4 (Parallel) — First-Party Plugins
- **Agent G**: Gmail plugin (OAuth, data source, AI pipeline, actions, views) — Tasks 10.1-10.5
- **Agent H**: GitHub plugin (auth, data sources, AI code review, actions, views) — Tasks 11.1-11.5
- **Agent I**: Linear plugin + Jira/ClickUp adapters — Tasks 12.1-12.6

### Wave 5 (Parallel) — Flow Builder + Monitoring
- **Agent J**: Cross-plugin flow builder enhancements + templates — Tasks 13.1-13.6
- **Agent K**: Monitoring plugins (Sentry, Datadog, CloudWatch) — Tasks 14.1-14.4
- **Agent L**: Multi-model AI (OpenAI, Gemini, local providers) — Tasks 15.1-15.5

### Wave 6 (Sequential) — Production
- **Agent M**: Code signing + CI/CD — Tasks 17.1-17.5
- **Agent N**: Licensing + telemetry — Tasks 18.1-18.5
- **Agent O**: Performance optimization — Tasks 19.1-19.6

---

## 8. Key Architecture Decisions

| Decision | Choice | Alternative Considered | Rationale |
|----------|--------|----------------------|-----------|
| Primary UI | Unified inbox | Flow builder first | Users need to see value immediately; inbox is the daily driver |
| Architecture | Plugin-first | Hard-coded integrations | Ecosystem moat; community growth; extensibility |
| AI strategy | Multi-model abstraction | Claude-only | Risk mitigation; user choice; cost optimization |
| Plugin sandbox | isolated-vm | vm2, QuickJS-WASM | V8-native speed; process-level isolation; no CVEs |
| Desktop framework | Electron | Tauri | Node.js ecosystem; Cursor/VSCode precedent |
| UI framework | React 19 + Compiler | Solid, Svelte | Ecosystem (React Flow, cmdk, shadcn); largest talent pool |
| State management | Zustand | MobX, Jotai | Natural React integration; Compiler compatible |
| Flow builder | @xyflow/react v12 | Rete.js | 50x more downloads; React-native |
| Database | SQLite + better-sqlite3 | IndexedDB, PouchDB | Synchronous reads; WAL mode; no external deps |
| Secrets | Electron safeStorage | keytar-only | Built-in; OS keychain delegation |
| Licensing | Keygen.sh | Lemon Squeezy | SOC 2; offline grace; Electron-native |
| Design system | shadcn/ui + Radix | Ark UI, MUI | Copy-to-project; Linear uses same stack |
| Architecture | Feature-Sliced Design | Atomic Design | Strict layer boundaries; unidirectional imports |

---

## 9. Revenue Path Summary

| Tier | Price | Features |
|------|-------|----------|
| Free | $0 | 3 plugins, 100 AI actions/mo, 5 flows, community support |
| Pro | $19/mo | Unlimited plugins, 500 AI actions/mo, unlimited flows, all first-party plugins |
| Team | $39/user/mo | Pro + shared inbox views, team flows, SSO, 2000 AI actions/user |
| Enterprise | Custom | Self-hosted, unlimited, custom plugins, SLA, audit logs |

**$1M ARR target**: ~3,100-4,400 paying users (achievable within 9-12 months based on comparable growth curves).

---

## 10. Key Use Cases (Plugin Examples)

### Gmail + AI
1. Pull new emails every 60 seconds
2. AI classifies: Important (needs response), FYI (read later), Noise (auto-archive)
3. For Important emails: AI drafts a reply based on context
4. Developer sees only important emails in inbox, with drafts ready to send

### Linear / Jira + AI
1. Pull assigned tickets in current sprint/cycle
2. AI analyzes each ticket: breaks into subtasks, estimates complexity, suggests implementation approach
3. Developer opens inbox, sees pre-planned tickets ready to work on
4. One click to create subtasks in Linear/Jira

### GitHub + AI
1. Pull PRs where review is requested
2. AI analyzes diff: identifies bugs, style issues, architecture concerns
3. Developer sees AI review summary in inbox
4. One click to approve, or edit AI comments before posting

### Sentry + AI
1. Pull new errors/exceptions
2. AI analyzes stack traces, correlates with recent deployments
3. Suggests root cause and fix approach
4. Developer sees actionable error summaries, not raw stack traces

---

## 11. Source Documents

This plan synthesizes and supersedes findings from:

1. **business-analysis.md** — Market research, pricing, GTM, competitive analysis
2. **frontend-architecture.md** — UI framework, state management, design system
3. **backend-architecture.md** — Execution engine, database, plugins, AI integration
4. **security-architecture.md** — Threat model, Electron security, secrets, code signing
5. **security-architecture-extended.md** — Extended security reference
6. **performance-architecture.md** — Performance budgets, startup, rendering, memory

---

*This is the master implementation plan for DevRig v2. Phase 1 (Foundation) is complete. Phase 2-3 (Plugin SDK + Unified Inbox) produce the core product. Phase 4 (First-Party Plugins) demonstrates the platform's value. Phases 5-7 expand the ecosystem and prepare for launch.*
