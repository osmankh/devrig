# DevRig Frontend Architecture

**Document Version**: 2.0
**Date**: 2026-02-11
**Purpose**: Production-grade frontend architecture specification for DevRig, an Electron desktop application serving as an AI-powered developer command center. Designed to match Linear's UI speed and polish.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [UI Framework and Library Choices](#2-ui-framework-and-library-choices)
3. [Component Architecture](#3-component-architecture) (incl. 3.3 Plugin View System)
4. [Visual Flow Builder](#4-visual-flow-builder)
5. [State Management Architecture](#5-state-management-architecture)
6. [Design System Specification](#6-design-system-specification)
7. [Animation and Interaction Strategy](#7-animation-and-interaction-strategy)
8. [Performance Optimization](#8-performance-optimization)
9. [Keyboard Navigation and Command Palette](#9-keyboard-navigation-and-command-palette)
10. [Package Manifest](#10-package-manifest)
11. [Folder Structure](#11-folder-structure)
12. [Appendix: Research Sources](#appendix-research-sources)

---

## 1. Executive Summary

DevRig is a commercial Electron desktop application that serves as an AI-powered developer command center. The primary UI is a unified inbox/dashboard that aggregates and displays priority-sorted items from all connected plugins -- emails, tickets, pull requests, alerts, and any other developer-relevant signals -- into a single, actionable feed. AI classification and drafting are built into the core experience: items are automatically triaged, and AI-generated responses or actions are surfaced alongside each item.

The visual flow builder, previously the centerpiece of the application, becomes a secondary power-user feature for creating custom automation workflows. The inbox is the surface most users interact with daily; the flow builder is where power users define the rules and automations that feed into and act upon inbox items.

The UI must deliver the same instantaneous feel that Linear achieves -- every click, every transition, every state change must feel immediate.

### What Makes Linear Fast (And How We Replicate It)

Linear's speed comes from a combination of architectural decisions, not any single trick:

1. **Local-first data**: Linear stores all data in IndexedDB on the client. Reads never hit the network. The UI renders from a local database, and a sync engine reconciles with the server in the background via WebSocket delta packets. We adopt this same pattern using SQLite in the main process.

2. **Optimistic mutations**: When a user changes something, Linear updates the in-memory object graph and UI immediately, queues a transaction for the server, and only rolls back on failure. We implement this with Zustand stores that write-through to SQLite.

3. **Lazy hydration**: Linear does not load all data at startup. It bootstraps core models first (a "full bootstrap"), then lazily hydrates secondary data (a "partial bootstrap") only when accessed. We replicate this with tiered data loading.

4. **MobX reactivity**: Linear uses MobX for fine-grained observable state, meaning only the specific UI components that depend on a changed field re-render. We achieve equivalent granularity using Zustand selectors combined with the React Compiler's automatic memoization.

5. **Keyboard-first design**: Nearly every action in Linear is keyboard-accessible. `Cmd+K` opens a command palette (powered by `cmdk`, the same library Linear uses). We build the same pattern.

6. **Minimal, purposeful animations**: Linear does not use heavy animations. Transitions are short (120-200ms), use GPU-accelerated properties (transform, opacity), and serve functional purposes (communicating state changes), not decoration.

---

## 2. UI Framework and Library Choices

### 2.1 Core Framework: React 19 + React Compiler

**Decision**: React 19 with the React Compiler (v1.0, stable since October 2025).

**Rationale**:

- **React Compiler automatic memoization** eliminates the need for manual `useMemo`, `useCallback`, and `React.memo` in most cases. Meta reports up to 12% faster initial loads and 2.5x faster interactions in production. This directly addresses the primary performance concern with React in Electron -- unnecessary re-renders.
- **Ecosystem dominance**: React has the largest component ecosystem, which matters for a commercial product with a shipping deadline. Every library we need (React Flow, cmdk, shadcn/ui, Motion) is React-first.
- **Hiring and maintenance**: React developers are the largest available talent pool.

**Why not Solid or Svelte?** While SolidJS (3.86KB) and Svelte (1.85KB) have smaller bundle sizes and no virtual DOM overhead, the advantages are marginal in an Electron context where the bundle is loaded from disk, not over the network. The ecosystem gap (React Flow, cmdk, shadcn/ui, Motion are all React-native) would require significant custom development to fill. The React Compiler closes much of the performance gap by eliminating unnecessary re-renders automatically.

### 2.2 Build Tooling: electron-vite 5.0

**Decision**: `electron-vite` 5.0 as the build tool.

**Rationale**:

- Purpose-built for Electron with separate build pipelines for main process, preload scripts, and renderer.
- Instant HMR for renderer processes during development.
- Hot reloading for main process and preload scripts.
- V8 bytecode compilation for source code protection in the commercial distribution.
- Built-in support for TypeScript, React, and multi-threading via import suffixes.
- Requires Vite 5.0+ and Node.js 20.19+ (our baseline).

Electron Forge is used only for packaging and distribution, not as the build tool. electron-vite handles the compilation pipeline; Electron Forge handles `.dmg`, `.exe`, `.AppImage` output.

### 2.3 Electron Architecture

**Target**: Electron 34+ (Chromium 132+, Node.js 22+).

**Process Architecture**:

```
Main Process (Node.js)
├── SQLite database (better-sqlite3, synchronous)
├── File system operations
├── AI model orchestration (spawns child processes)
├── IPC handler registry
└── Auto-updater

Renderer Process (Chromium)
├── React 19 application
├── Zustand stores (in-memory state)
├── IPC client (invoke pattern)
└── UI rendering

Preload Scripts (Bridge)
├── Typed IPC API surface
├── contextBridge exposure
└── Security boundary enforcement
```

**IPC Strategy**: All renderer-to-main communication uses `ipcRenderer.invoke` / `ipcMain.handle` (the recommended two-way async pattern introduced in Electron 7). No `ipcRenderer.send` for two-way communication. Heavy computation never runs in the main process -- it is offloaded to worker threads or child processes to avoid blocking the event loop.

---

## 3. Component Architecture

### 3.1 Methodology: Feature-Sliced Design (FSD)

**Decision**: Feature-Sliced Design, adapted for a desktop application.

FSD organizes code into seven layers with a strict unidirectional import rule: **modules on one layer can only import from layers strictly below**.

**Adapted Layer Structure for DevRig**:

| Layer | Purpose | Example Contents |
|-------|---------|-----------------|
| `app` | Application shell, routing, providers, global styles | Electron window management, theme provider, error boundaries |
| `pages` | Full views composed from widgets and features | Inbox page (primary), flow editor, settings, plugin marketplace, execution history |
| `widgets` | Self-contained UI blocks combining features | Unified inbox feed, detail panel, AI draft panel, sidebar, flow canvas, command palette |
| `features` | Business capabilities delivering user value | Inbox filtering, inbox actions, plugin configuration, onboarding, configure-node, undo-redo |
| `entities` | Business domain objects | InboxItem, Plugin, AIProvider, Flow, Node, Edge, Execution, Workspace |
| `shared` | Reusable, project-agnostic code | Design system components, hooks, utilities, types, IPC client |

Within each layer (except `app` and `shared`), code is divided into **slices** by business domain. Slices on the same layer cannot import from each other. Within each slice, code is organized into **segments**:

- `ui/` -- React components and styles
- `model/` -- Zustand stores, types, business logic
- `api/` -- IPC calls, data fetching
- `lib/` -- Utilities specific to this slice
- `config/` -- Constants, feature flags

### 3.2 Component Design Principles

**Composition over configuration**: Components are small and composed together, not configured with dozens of props. A `<NodeEditor>` is composed of `<NodeCanvas>`, `<NodeToolbar>`, `<NodeProperties>`, not a single component with mode flags.

**Colocation**: Styles, tests, and types live next to their component, not in separate directories.

**Public API enforcement**: Every slice exposes a barrel `index.ts` file. Internal modules are never imported directly from outside the slice. ESLint rules enforce this boundary.

### 3.3 Plugin View System

Plugins can register custom views that extend the DevRig UI. These views appear in two contexts:

1. **Detail views**: When a user selects an inbox item provided by a plugin, the detail panel renders the plugin's custom detail view. For example, a GitHub plugin registers a pull request detail view that shows diffs, checks, and review status.

2. **Dashboard panels**: Plugins can register dashboard widgets that appear on the inbox page as summary cards or sidebar sections (e.g., a "GitHub Activity" panel or "Linear Sprint Progress" panel).

**Rendering strategy**: Plugin views are rendered using one of two mechanisms, depending on the plugin's trust level and complexity:

- **Sandboxed iframes**: Third-party and marketplace plugins render their views inside sandboxed `<iframe>` elements with a restrictive `sandbox` attribute (`allow-scripts` only, no `allow-same-origin`). Communication between the host renderer and the iframe uses `postMessage` with a structured protocol. The iframe receives serialized item data and emits user action intents back to the host.

- **Serialized UI descriptions**: For simpler views or first-party plugins, the plugin returns a JSON-based UI description (a declarative tree of layout primitives: `stack`, `text`, `badge`, `button`, `link`, `code`, `divider`). The host renderer interprets this description and renders it using native shadcn/ui components. This approach avoids iframe overhead and ensures visual consistency with the rest of the application.

```
Plugin View Registration:
plugin.registerView({
  type: 'detail',                    // 'detail' | 'dashboard-panel'
  itemTypes: ['github:pull-request'], // Which inbox item types this view handles
  render: 'serialized',             // 'serialized' | 'iframe'
  // For serialized: return a UI description tree
  // For iframe: return a URL to the plugin's bundled HTML
});
```

The `entities/plugin/` slice owns the plugin view registry. The `widgets/detail-panel/` widget consults the registry to determine which view to render for a selected inbox item. If no plugin view is registered for an item type, a generic detail view is used as the fallback.

---

## 4. Visual Flow Builder

### 4.1 Library Choice: React Flow (@xyflow/react 12.x)

**Decision**: `@xyflow/react` v12.10+ as the visual flow builder library.

**Rationale**:

- **Market dominance**: 1.15M weekly npm downloads, 34.7K GitHub stars. More than 50x the downloads of the next competitor (Rete.js at 20K weekly downloads). This means better documentation, community support, and battle-tested edge cases.
- **Performance**: React Flow only re-renders changed nodes, not the entire canvas. It supports viewport-based rendering (nodes outside the visible area are not rendered).
- **Custom nodes**: Full support for custom React components as nodes, with complete control over rendering.
- **Built-in features**: Zoom, pan, minimap, controls, background grid, keyboard shortcuts, single/multi selection, drag-and-drop -- all out of the box.
- **Workflow editor template**: xyflow provides a first-party workflow editor template with ELKjs layout engine integration and drag-and-drop sidebar, which closely matches our requirements.

**Why not Rete.js?** Rete.js offers more flexibility for advanced dataflow programming UIs, but React Flow's ecosystem, performance characteristics, and first-party React integration are superior for our use case. A limitation noted in the community is that extending React Flow beyond its capabilities can be difficult, but our visual workflow builder fits squarely within React Flow's design target.

### 4.2 Performance Strategy for 100+ Nodes

Based on React Flow's official performance documentation and community optimization guides:

1. **Memoize custom node components**: All custom nodes wrapped in `React.memo` (or the React Compiler handles this automatically). Node components declared outside parent components to prevent reference recreation.

2. **Memoize callbacks and objects**: All event handlers use `useCallback`. Static configuration objects (`defaultEdgeOptions`, `snapGrid`) use `useMemo` and are declared at module scope when possible.

3. **Avoid direct state subscription for nodes/edges**: Never use `useStore(state => state.nodes)` in components. Use targeted selectors that extract only the specific data needed.

4. **Simplify CSS for large canvases**: Disable box-shadows, complex gradients, and CSS animations on nodes when node count exceeds a threshold (e.g., 50 nodes). Use a `data-density` attribute on the canvas container to trigger simplified styles.

5. **Collapse subtrees**: Use the `hidden` property to dynamically collapse node subtrees that are not in the viewport or are explicitly collapsed by the user.

6. **Graph partitioning**: For very large flows (200+ nodes), partition the graph into sub-flows that can be expanded/collapsed as composite nodes.

### 4.3 Custom Node Architecture

```
src/entities/node/ui/
├── BaseNode.tsx           # Shared layout: handles, label, status indicator
├── TriggerNode.tsx        # Event trigger (webhook, cron, file watch)
├── ActionNode.tsx         # Execution step (shell, API call, file op)
├── AINode.tsx             # AI model invocation node
├── ConditionNode.tsx      # Branching logic node
├── LoopNode.tsx           # Iteration node
├── SubflowNode.tsx        # Composite node referencing another flow
└── node-registry.ts       # Maps node type string to component
```

Each custom node follows a consistent pattern:

```tsx
// Example: ActionNode.tsx
const ActionNode = memo(({ id, data }: NodeProps<ActionNodeData>) => {
  const status = useExecutionStatus(id);

  return (
    <BaseNode id={id} status={status}>
      <ActionNodeContent data={data} />
      <Handle type="target" position={Position.Left} />
      <Handle type="source" position={Position.Right} />
    </BaseNode>
  );
});
```

---

## 5. State Management Architecture

### 5.1 Store Architecture: Zustand + Immer + Zundo

**Decision**: Zustand as the primary state manager, with Immer middleware for immutable updates and Zundo for undo/redo.

**Rationale**:

- **Zustand over Jotai**: Zustand's centralized store model is a better fit for our domain (flows, nodes, edges are inherently interconnected graph state). Jotai's atomic model excels at fine-grained independent state, but flow graph state has high inter-dependency. Zustand selectors provide sufficient re-render optimization.
- **Zustand over MobX**: Linear uses MobX for its observable/reactive model, but Zustand integrates more naturally with modern React patterns and the React Compiler. MobX's decorator-based model definitions add complexity without proportional benefit for our use case.
- **Immer middleware**: Enables writing mutations as if state were mutable (`state.nodes[id].data.label = "new label"`) while maintaining immutable state under the hood. This makes complex graph mutations readable.
- **Zundo**: Provides undo/redo middleware for Zustand at under 700 bytes. Integrates directly with React Flow's undo/redo patterns. Supports `pause`, `resume`, `clear`, and stepping through history.

### 5.2 Store Decomposition

```
stores/
├── inbox-store.ts         # Inbox items, filters, read/unread state, AI classifications
├── plugin-store.ts        # Installed plugins, sync status, configuration
├── ai-store.ts            # AI providers, model selection, usage tracking
├── flow-store.ts          # Nodes, edges, viewport, selected elements
├── execution-store.ts     # Running executions, logs, step statuses
├── workspace-store.ts     # Workspace config, recent files, preferences
├── ui-store.ts            # Sidebar state, panel sizes, modals, toasts
└── command-store.ts       # Command palette state, recent commands
```

**`inbox-store.ts`**: The primary store for the application's default view. Holds the unified list of inbox items aggregated from all connected plugins, along with filter state (source, type, priority, read/unread), sort order, and AI-generated classifications (priority level, suggested action, category). Items are normalized by ID for O(1) lookup. The store supports optimistic read/unread toggling and bulk actions (archive, snooze, mark-done).

**`plugin-store.ts`**: Tracks all installed plugins, their connection/sync status (connected, syncing, error, disconnected), configuration state, and the view registrations each plugin has made (detail views, dashboard panels). Plugin sync progress is exposed here so the UI can show per-source sync indicators.

**`ai-store.ts`**: Manages AI provider configurations (API keys stored via safeStorage, not in this store), model selection per task type (classification, drafting, summarization), and usage tracking (token counts, rate limit status). This store is consumed by both the inbox AI features and the flow builder AI node.

**Store boundary rule**: Each store is independent with no direct cross-store imports. Cross-store coordination happens through React components that subscribe to multiple stores, or through the IPC layer (e.g., starting an execution reads from flow-store and writes to execution-store; an inbox action may trigger a flow execution).

### 5.3 Local-First Data Architecture (Linear-Inspired)

Inspired by Linear's sync engine, DevRig uses a three-tier data architecture:

```
┌─────────────────────────────────────────────────┐
│  Tier 1: In-Memory (Zustand Stores)             │
│  - Current working state                         │
│  - Instant reads, optimistic writes              │
│  - React components subscribe here               │
├─────────────────────────────────────────────────┤
│  Tier 2: Local Database (SQLite via main process)│
│  - Persistent storage on disk                    │
│  - Source of truth for recovery                  │
│  - Synchronous reads via better-sqlite3          │
├─────────────────────────────────────────────────┤
│  Tier 3: Remote Sync (Optional cloud sync)       │
│  - Team collaboration features                   │
│  - WebSocket delta sync (future)                 │
│  - Last-Write-Wins conflict resolution           │
└─────────────────────────────────────────────────┘
```

**Data flow for mutations**:

1. User action triggers a Zustand store mutation (Tier 1 -- instant, UI updates immediately).
2. The mutation is written through to SQLite via IPC invoke (Tier 2 -- persisted within milliseconds).
3. If cloud sync is enabled, the mutation is queued as a transaction and sent via WebSocket (Tier 3 -- eventual consistency).
4. On failure at any tier, the Zustand store rolls back to the last known-good state from SQLite.

**Data flow for reads**:

1. On app startup, SQLite is read to hydrate Zustand stores (bootstrapping).
2. During operation, all reads come from Zustand (in-memory, zero latency).
3. Large datasets (execution history) are loaded lazily from SQLite on demand, not at startup.

### 5.4 Optimistic Updates Pattern

```tsx
// Pattern: Optimistic update with rollback
async function renameNode(nodeId: string, newLabel: string) {
  const previousLabel = flowStore.getState().nodes[nodeId].data.label;

  // 1. Optimistic update (instant)
  flowStore.setState((state) => {
    state.nodes[nodeId].data.label = newLabel;
  });

  try {
    // 2. Persist to SQLite
    await ipc.invoke('db:updateNode', { nodeId, label: newLabel });
  } catch (error) {
    // 3. Rollback on failure
    flowStore.setState((state) => {
      state.nodes[nodeId].data.label = previousLabel;
    });
    toast.error('Failed to rename node');
  }
}
```

### 5.5 Undo/Redo System

Zundo wraps the flow-store to provide temporal state:

```tsx
import { temporal } from 'zundo';

const useFlowStore = create<FlowState>()(
  temporal(
    immer((set) => ({
      nodes: [],
      edges: [],
      // ... mutations
    })),
    {
      limit: 100,                    // Keep last 100 states
      partialize: (state) => ({      // Only track nodes and edges
        nodes: state.nodes,
        edges: state.edges,
      }),
    }
  )
);

// Usage in command palette or keyboard shortcut
const { undo, redo, canUndo, canRedo } = useFlowStore.temporal.getState();
```

### 5.6 Electron IPC State Bridge

The preload script exposes a typed API:

```tsx
// preload/api.ts
const api = {
  db: {
    getFlow: (id: string) => ipcRenderer.invoke('db:getFlow', id),
    saveFlow: (flow: FlowData) => ipcRenderer.invoke('db:saveFlow', flow),
    updateNode: (patch: NodePatch) => ipcRenderer.invoke('db:updateNode', patch),
    // ...
  },
  ai: {
    execute: (prompt: string) => ipcRenderer.invoke('ai:execute', prompt),
    // ...
  },
  fs: {
    readFile: (path: string) => ipcRenderer.invoke('fs:readFile', path),
    // ...
  },
};

contextBridge.exposeInMainWorld('devrig', api);
```

---

## 6. Design System Specification

### 6.1 Foundation: shadcn/ui + Radix UI + Tailwind CSS v4

**Decision**: shadcn/ui components built on Radix UI primitives, styled with Tailwind CSS v4.

**Rationale**:

- **shadcn/ui** provides pre-built, accessible, production-ready components that you copy into your project (not an npm dependency). This gives full ownership and customization ability, which is critical for a commercial product with a distinctive visual identity.
- **Radix UI** (unified `radix-ui` package as of February 2026) provides the headless primitive layer: accessibility, keyboard navigation, focus management, and ARIA attributes are handled correctly out of the box. 32 component primitives covering dialogs, dropdowns, tooltips, tabs, and more.
- **Tailwind CSS v4** introduces the `@theme` directive for CSS-first design tokens. All tokens are exposed as native CSS variables at runtime, enabling dynamic theming without JavaScript. No more context-switching between CSS and a JavaScript config file.

**Why not Ark UI?** Ark UI's multi-framework support (React, Vue, Solid) and state machine approach (XState) are architecturally interesting, but shadcn/ui + Radix has a significantly larger ecosystem (8M+ weekly downloads for Radix, 2500+ projects using cmdk) and is the established standard. Linear itself uses Radix-based components.

### 6.2 Design Tokens (Tailwind CSS v4 @theme)

```css
/* src/shared/styles/tokens.css */

@theme {
  /* ─── Color System ─── */
  --color-bg-primary: oklch(0.145 0 0);
  --color-bg-secondary: oklch(0.178 0 0);
  --color-bg-tertiary: oklch(0.211 0 0);
  --color-bg-elevated: oklch(0.195 0 0);
  --color-bg-hover: oklch(0.227 0 0);
  --color-bg-active: oklch(0.26 0 0);

  --color-text-primary: oklch(0.985 0 0);
  --color-text-secondary: oklch(0.708 0 0);
  --color-text-tertiary: oklch(0.556 0 0);
  --color-text-disabled: oklch(0.4 0 0);

  --color-border-default: oklch(0.267 0 0);
  --color-border-subtle: oklch(0.211 0 0);
  --color-border-focus: oklch(0.623 0.214 259);

  --color-accent-primary: oklch(0.623 0.214 259);
  --color-accent-hover: oklch(0.673 0.214 259);
  --color-accent-muted: oklch(0.623 0.214 259 / 0.15);

  --color-success: oklch(0.648 0.15 160);
  --color-warning: oklch(0.75 0.15 80);
  --color-error: oklch(0.637 0.237 25);
  --color-info: oklch(0.623 0.214 259);

  /* Node type colors */
  --color-node-trigger: oklch(0.75 0.15 80);
  --color-node-action: oklch(0.623 0.214 259);
  --color-node-condition: oklch(0.7 0.15 310);
  --color-node-ai: oklch(0.648 0.15 160);
  --color-node-loop: oklch(0.65 0.15 45);

  /* ─── Typography ─── */
  --font-family-sans: 'Inter Variable', 'Inter', system-ui, -apple-system, sans-serif;
  --font-family-mono: 'JetBrains Mono Variable', 'JetBrains Mono', 'Fira Code', monospace;

  --font-size-xs: 0.6875rem;    /* 11px */
  --font-size-sm: 0.75rem;      /* 12px */
  --font-size-base: 0.8125rem;  /* 13px -- Linear uses 13px base */
  --font-size-md: 0.875rem;     /* 14px */
  --font-size-lg: 1rem;         /* 16px */
  --font-size-xl: 1.25rem;      /* 20px */
  --font-size-2xl: 1.5rem;      /* 24px */

  --line-height-tight: 1.2;
  --line-height-normal: 1.5;
  --line-height-relaxed: 1.625;

  --font-weight-normal: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  /* ─── Spacing ─── */
  --spacing-0: 0;
  --spacing-0-5: 0.125rem;   /* 2px */
  --spacing-1: 0.25rem;      /* 4px */
  --spacing-1-5: 0.375rem;   /* 6px */
  --spacing-2: 0.5rem;       /* 8px */
  --spacing-3: 0.75rem;      /* 12px */
  --spacing-4: 1rem;         /* 16px */
  --spacing-5: 1.25rem;      /* 20px */
  --spacing-6: 1.5rem;       /* 24px */
  --spacing-8: 2rem;         /* 32px */
  --spacing-10: 2.5rem;      /* 40px */
  --spacing-12: 3rem;        /* 48px */
  --spacing-16: 4rem;        /* 64px */

  /* ─── Border Radius ─── */
  --radius-sm: 0.25rem;      /* 4px */
  --radius-md: 0.375rem;     /* 6px */
  --radius-lg: 0.5rem;       /* 8px */
  --radius-xl: 0.75rem;      /* 12px */
  --radius-full: 9999px;

  /* ─── Shadows ─── */
  --shadow-sm: 0 1px 2px 0 oklch(0 0 0 / 0.15);
  --shadow-md: 0 4px 6px -1px oklch(0 0 0 / 0.2), 0 2px 4px -2px oklch(0 0 0 / 0.15);
  --shadow-lg: 0 10px 15px -3px oklch(0 0 0 / 0.25), 0 4px 6px -4px oklch(0 0 0 / 0.15);
  --shadow-xl: 0 20px 25px -5px oklch(0 0 0 / 0.3), 0 8px 10px -6px oklch(0 0 0 / 0.2);

  /* ─── Animation ─── */
  --duration-instant: 0ms;
  --duration-fast: 100ms;
  --duration-normal: 150ms;
  --duration-moderate: 200ms;
  --duration-slow: 300ms;

  --ease-default: cubic-bezier(0.25, 0.1, 0.25, 1);
  --ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --ease-out-expo: cubic-bezier(0.16, 1, 0.3, 1);

  /* ─── Z-Index Scale ─── */
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-popover: 500;
  --z-toast: 600;
  --z-command-palette: 700;
  --z-tooltip: 800;

  /* ─── Layout ─── */
  --sidebar-width: 240px;
  --sidebar-collapsed-width: 48px;
  --panel-min-width: 280px;
  --toolbar-height: 40px;
  --titlebar-height: 38px;
}
```

### 6.3 Dark and Light Theme

Themes are implemented via CSS variable overrides, not JavaScript:

```css
/* src/shared/styles/themes/dark.css */
:root, [data-theme="dark"] {
  --color-bg-primary: oklch(0.145 0 0);
  --color-bg-secondary: oklch(0.178 0 0);
  --color-text-primary: oklch(0.985 0 0);
  --color-text-secondary: oklch(0.708 0 0);
  --color-border-default: oklch(0.267 0 0);
  /* ... override all semantic color tokens */
}

/* src/shared/styles/themes/light.css */
[data-theme="light"] {
  --color-bg-primary: oklch(1 0 0);
  --color-bg-secondary: oklch(0.968 0 0);
  --color-text-primary: oklch(0.145 0 0);
  --color-text-secondary: oklch(0.4 0 0);
  --color-border-default: oklch(0.868 0 0);
  /* ... override all semantic color tokens */
}
```

Theme switching is instantaneous because it only changes a `data-theme` attribute on the root element. No JavaScript state changes, no re-renders, no style recalculation beyond the CSS variable cascade.

### 6.4 Typography System

Following Linear's approach of compact, information-dense typography suited for professional tools:

| Role | Size | Weight | Line Height | Usage |
|------|------|--------|-------------|-------|
| Body | 13px | 400 | 1.5 | Default text, descriptions |
| Body Small | 12px | 400 | 1.5 | Secondary text, metadata |
| Label | 11px | 500 | 1.2 | Form labels, badges, tags |
| Heading 1 | 20px | 600 | 1.2 | Page titles |
| Heading 2 | 16px | 600 | 1.2 | Section titles |
| Heading 3 | 14px | 600 | 1.2 | Subsection titles |
| Code | 12px | 400 (mono) | 1.5 | Code snippets, node configs |

### 6.5 Component Inventory

The following shadcn/ui components are included and customized:

**Layout**: Sidebar, ResizablePanel, ScrollArea, Separator, Tabs
**Forms**: Input, Textarea, Select, Checkbox, Switch, Slider, RadioGroup, Label
**Data Display**: Badge, Avatar, Card, Table, Skeleton
**Feedback**: Toast (Sonner), Alert, Progress, Tooltip
**Overlay**: Dialog, Sheet, Popover, DropdownMenu, ContextMenu, Command (cmdk)
**Navigation**: Breadcrumb, Menubar

**Custom components** (built on Radix primitives, not from shadcn/ui):

- `InboxFeed` -- Virtualized, priority-sorted list of unified inbox items
- `DetailPanel` -- Context-sensitive item detail view with plugin view rendering
- `AIDraftPanel` -- AI-generated response/action suggestions for the selected item
- `PluginStatusIndicator` -- Connection and sync status for each plugin source
- `FlowCanvas` -- React Flow wrapper with project-specific defaults
- `NodePalette` -- Draggable node type sidebar
- `PropertyPanel` -- Context-sensitive node configuration editor
- `ExecutionTimeline` -- Scrollable execution step visualization
- `AIAssistant` -- Chat-style AI interaction panel
- `KeyboardShortcutHint` -- Inline shortcut badge (e.g., `Ctrl+Z`)

---

## 7. Animation and Interaction Strategy

### 7.1 Animation Library: Motion (Framer Motion successor)

**Decision**: `motion` (the library formerly known as Framer Motion, now maintained by Motion Division at motion.dev).

**Rationale**:

- **Hybrid engine**: Motion uses a combination of the Web Animations API (WAAPI) for GPU-accelerated animations and JavaScript fallbacks for complex cases. WAAPI animations run on the compositor thread at 120fps, not the main thread.
- **Layout animations**: Industry-leading layout animation engine for animating between different DOM layouts (e.g., reordering list items, expanding panels).
- **Gesture support**: Built-in `whileHover`, `whileTap`, `whileDrag` for micro-interactions.
- **Spring physics**: Spring-based animations feel more natural than easing curves for interactive elements.
- **AnimatePresence**: Handles exit animations, which are critical for modals, toasts, and panels.

### 7.2 Animation Budget and Principles

| Category | Duration | Easing | Properties |
|----------|----------|--------|------------|
| Micro-interaction (hover, press) | 80-120ms | ease-out | opacity, transform(scale) |
| Panel transition (open/close) | 150-200ms | ease-out-expo | transform(translateX), opacity |
| Modal/dialog | 150ms in, 100ms out | spring(stiffness:400, damping:30) | transform(scale), opacity |
| Page transition | 120-180ms | ease-in-out | opacity |
| Toast notification | 200ms in, 150ms out | spring | transform(translateY), opacity |
| Node status change | 200ms | ease-out | background-color, border-color |
| Drag (flow canvas) | 0ms (direct manipulation) | none | transform(translate) |

**Hard rules**:

1. **Never animate layout properties** (width, height, top, left). Only animate `transform` and `opacity`, which are GPU-composited and do not trigger layout recalculation.
2. **Never block interaction with animation**. If a panel is animating open, it must be interactive before the animation completes.
3. **Respect reduced motion**. All animations check `prefers-reduced-motion` and fall back to instant state changes.
4. **Maximum 200ms for interactive elements**. Nothing the user directly triggers should take more than 200ms to visually respond.

### 7.3 Skeleton Loading States

For any data that requires asynchronous loading (execution history, AI responses, large flow files):

- Skeleton placeholders match the exact layout of the content they replace (no layout shift).
- Shimmer animation uses a CSS gradient with `background-position` animation (GPU-accelerated).
- Skeletons appear only if data takes longer than 100ms to load (avoid flash of skeleton for fast loads).
- Transition from skeleton to content uses a 150ms opacity fade.

Implementation uses `react-loading-skeleton` with shadcn/ui's Skeleton component as the visual base.

### 7.4 Specific Interaction Patterns

**Sidebar collapse/expand**:
```tsx
<motion.aside
  animate={{ width: collapsed ? 48 : 240 }}
  transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
>
```

**Command palette appearance**:
```tsx
<AnimatePresence>
  {open && (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ duration: 0.15 }}
    >
      <Command />
    </motion.div>
  )}
</AnimatePresence>
```

**Node addition to canvas**:
```tsx
<motion.div
  initial={{ opacity: 0, scale: 0.8 }}
  animate={{ opacity: 1, scale: 1 }}
  transition={{ type: "spring", stiffness: 400, damping: 25 }}
>
  <CustomNode />
</motion.div>
```

---

## 8. Performance Optimization

### 8.1 Startup Performance

Targeting cold start to interactive UI in under 1.5 seconds.

**Strategies**:

1. **Route-based code splitting**: Only the initial view (the inbox) is loaded at startup. The flow editor, settings, execution history, plugin marketplace, and other views are lazy-loaded.

2. **Preload script minimization**: The preload script exposes only the typed IPC API surface. No business logic, no heavy imports.

3. **Tiered data loading** (Linear-inspired):
   - **Immediate**: Workspace config, UI preferences, inbox items (most recent page), plugin connection status.
   - **Deferred (within 1s)**: AI classifications for visible inbox items, plugin sync deltas.
   - **Lazy (on demand)**: Full flow data, execution history, AI conversation history, older inbox items.

4. **V8 bytecode snapshots**: electron-vite 5.0 supports compiling renderer code to V8 bytecode, which eliminates JavaScript parsing time on subsequent launches.

5. **Main process init ordering**: SQLite database connection is established before window creation. The renderer can invoke database reads immediately on first paint.

### 8.2 Runtime Rendering Performance

1. **React Compiler**: Automatic memoization eliminates 90%+ of manual memoization needs. Meta reports 25-40% fewer re-renders in complex applications.

2. **Zustand selectors**: Every component subscribes to the minimal state slice it needs:
   ```tsx
   // Correct: only re-renders when this specific node's label changes
   const label = useFlowStore((s) => s.nodes[nodeId]?.data.label);

   // Incorrect: re-renders on any node change
   const nodes = useFlowStore((s) => s.nodes);
   ```

3. **Virtual scrolling with TanStack Virtual**: For execution logs, node lists, and any scrollable list exceeding 50 items. TanStack Virtual renders only visible items plus a small buffer (~60 DOM elements regardless of list size). Supports dynamic row heights with post-render measurement.

4. **React Flow viewport optimization**: Nodes outside the visible viewport are not rendered. Combined with memoized custom nodes, this keeps the DOM node count low even for large flows.

5. **Debounced expensive operations**: Node property edits that trigger validation or AI inference are debounced at 300ms. Canvas zoom/pan does not trigger state persists until interaction ends.

### 8.3 Memory Management

1. **Execution log pruning**: In-memory execution logs are capped at 1000 entries. Older entries are only available via SQLite query.

2. **Flow editor disposal**: When switching between flows, the previous flow's Zustand state is serialized to SQLite and garbage collected. Only one flow is fully hydrated in memory at a time.

3. **Image and asset cleanup**: Any blob URLs created for node icons or previews are revoked when components unmount.

### 8.4 Bundle Optimization

- **Tree-shaking**: All imports are ESM. No barrel file re-exports that would prevent tree-shaking.
- **Radix UI**: Using the unified `radix-ui` package with individual component imports to allow tree-shaking of unused primitives.
- **Motion**: Import only used features (`import { motion, AnimatePresence } from "motion/react"`).
- **React Flow**: Import `@xyflow/react` components individually.
- **Target bundle size**: Under 2MB for the initial renderer bundle (gzipped is irrelevant for Electron since it loads from disk).

---

## 9. Keyboard Navigation and Command Palette

### 9.1 Command Palette: cmdk

**Decision**: `cmdk` v1.1+ (the same library used by Linear and Raycast).

**Rationale**:

- Headless, unstyled -- full visual control via shadcn/ui's Command component.
- Handles focus management, keyboard navigation, and search filtering.
- ARIA-compliant: screen readers announce commands as they appear.
- Performant up to 2000-3000 items.
- Under 5KB bundle size.

### 9.2 Command Palette Architecture

```
Command Palette
├── Search Input (auto-focused, fuzzy search)
├── Command Groups
│   ├── Inbox
│   │   ├── Go to Inbox           [Cmd+1]
│   │   ├── Mark as Read          [Cmd+Shift+R]
│   │   ├── Archive               [E]
│   │   ├── Snooze...             [H]
│   │   ├── AI Draft Response     [Cmd+Shift+D]
│   │   └── Filter by Source...   [F]
│   ├── Flow Actions
│   │   ├── Add Node...           [A]
│   │   ├── Run Flow              [Cmd+Enter]
│   │   ├── Stop Execution        [Cmd+.]
│   │   └── Export Flow...        [Cmd+Shift+E]
│   ├── Navigation
│   │   ├── Go to Flow...         [Cmd+P]
│   │   ├── Go to Settings        [Cmd+,]
│   │   ├── Go to Executions      [Cmd+Shift+H]
│   │   └── Go to Plugins         [Cmd+Shift+M]
│   ├── Edit
│   │   ├── Undo                  [Cmd+Z]
│   │   ├── Redo                  [Cmd+Shift+Z]
│   │   ├── Select All Nodes      [Cmd+A]
│   │   └── Delete Selected       [Backspace]
│   ├── View
│   │   ├── Toggle Sidebar        [Cmd+B]
│   │   ├── Toggle Detail Panel   [Cmd+Shift+P]
│   │   ├── Zoom to Fit           [Cmd+0]
│   │   └── Toggle Theme          [Cmd+Shift+T]
│   └── AI
│       ├── Ask AI...             [Cmd+L]
│       ├── Generate Flow...      [Cmd+Shift+G]
│       └── Explain Node          [Cmd+Shift+E]
└── Recent Commands (persisted)
```

### 9.3 Global Keyboard Shortcut Map

**Implementation**: A centralized shortcut registry in `shared/lib/shortcuts.ts` that maps key combinations to command IDs. The registry handles:

- Platform-aware modifier keys (Cmd on macOS, Ctrl on Windows/Linux).
- Conflict detection (no two commands share the same shortcut in the same context).
- Context-sensitive shortcuts (e.g., `Delete` does different things on the canvas vs in a text input).
- User customization (shortcuts are persisted in workspace preferences and can be remapped).

| Category | Shortcut | Action |
|----------|----------|--------|
| **Global** | `Cmd+K` | Open command palette |
| | `Cmd+1` | Go to inbox |
| | `Cmd+,` | Open settings |
| | `Cmd+N` | New flow |
| | `Cmd+O` | Open flow |
| | `Cmd+S` | Save flow |
| | `Cmd+Z` | Undo |
| | `Cmd+Shift+Z` | Redo |
| | `Cmd+B` | Toggle sidebar |
| **Inbox** | `J` / `K` | Next / previous item |
| | `Enter` | Open selected item |
| | `E` | Archive selected |
| | `H` | Snooze selected |
| | `Cmd+Shift+R` | Mark as read/unread |
| | `Cmd+Shift+D` | AI draft response |
| | `F` | Open filter menu |
| **Canvas** | `A` | Add node (opens node palette) |
| | `Space+Drag` | Pan canvas |
| | `Cmd+Scroll` | Zoom |
| | `Cmd+0` | Zoom to fit |
| | `Cmd+1` | Zoom to 100% |
| | `Backspace/Delete` | Delete selected |
| | `Cmd+D` | Duplicate selected |
| | `Cmd+C/V` | Copy/paste nodes |
| | `Tab` | Cycle through nodes |
| | `Escape` | Deselect all |
| **Execution** | `Cmd+Enter` | Run flow |
| | `Cmd+.` | Stop execution |
| | `Cmd+Shift+H` | View execution history |
| **AI** | `Cmd+L` | Open AI assistant |

### 9.4 Accessibility

- **Focus management**: All interactive elements are keyboard-reachable via Tab. Focus is trapped inside modals and the command palette when open.
- **ARIA attributes**: All custom components include appropriate `role`, `aria-label`, `aria-describedby`, and `aria-live` attributes. Radix UI handles this for shadcn/ui components automatically.
- **Screen reader announcements**: Status changes (execution started, node added, error occurred) are announced via `aria-live="polite"` regions.
- **High contrast**: The OKLCH color system supports a high-contrast theme variant by adjusting lightness and chroma values.
- **Focus indicators**: A visible focus ring (2px solid, accent color) appears on all focusable elements. Never hidden, never removed.

---

## 10. Package Manifest

### 10.1 Core Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `react` | ^19.1.0 | UI framework |
| `react-dom` | ^19.1.0 | React DOM renderer |
| `electron` | ^34.0.0 | Desktop runtime |
| `@xyflow/react` | ^12.10.0 | Visual flow builder |
| `zustand` | ^5.0.0 | State management |
| `immer` | ^10.1.0 | Immutable state updates |
| `zundo` | ^2.3.0 | Undo/redo middleware for Zustand |
| `motion` | ^12.4.0 | Animation library (Framer Motion successor) |
| `cmdk` | ^1.1.1 | Command palette |
| `radix-ui` | ^1.2.0 | Headless UI primitives (unified package) |
| `@tanstack/react-virtual` | ^3.13.0 | Virtual scrolling |
| `tailwindcss` | ^4.1.0 | Utility CSS framework |
| `better-sqlite3` | ^11.8.0 | SQLite for main process |
| `sonner` | ^2.0.0 | Toast notifications |
| `react-loading-skeleton` | ^3.5.0 | Skeleton loading states |
| `elkjs` | ^0.9.0 | Graph layout engine (for auto-layout) |
| `@fontsource-variable/inter` | ^5.1.0 | Inter variable font |
| `@fontsource-variable/jetbrains-mono` | ^5.1.0 | JetBrains Mono variable font |

### 10.2 Development Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `electron-vite` | ^5.0.0 | Build tool for Electron |
| `@electron-forge/cli` | ^7.7.0 | Packaging and distribution |
| `@electron-forge/maker-dmg` | ^7.7.0 | macOS .dmg output |
| `@electron-forge/maker-squirrel` | ^7.7.0 | Windows installer |
| `@electron-forge/maker-deb` | ^7.7.0 | Linux .deb output |
| `babel-plugin-react-compiler` | ^19.0.0 | React Compiler (build-time) |
| `typescript` | ^5.7.0 | Type system |
| `@types/react` | ^19.1.0 | React type definitions |
| `@types/better-sqlite3` | ^7.6.0 | SQLite type definitions |
| `eslint` | ^9.18.0 | Linting |
| `@feature-sliced/eslint-config` | ^0.2.0 | FSD boundary enforcement |
| `vitest` | ^3.0.0 | Unit and component testing |
| `@testing-library/react` | ^16.2.0 | React testing utilities |
| `playwright` | ^1.50.0 | E2E testing |
| `@tailwindcss/vite` | ^4.1.0 | Tailwind Vite plugin |
| `postcss` | ^8.5.0 | CSS processing |

---

## 11. Folder Structure

```
devrig/
├── electron.vite.config.ts              # electron-vite configuration
├── forge.config.ts                       # Electron Forge packaging config
├── package.json
├── tsconfig.json
├── tsconfig.main.json                    # Main process TypeScript config
├── tsconfig.preload.json                 # Preload TypeScript config
├── tsconfig.renderer.json               # Renderer TypeScript config
│
├── src/
│   ├── main/                             # Electron main process
│   │   ├── index.ts                      # Entry point, window creation
│   │   ├── ipc/                          # IPC handler registry
│   │   │   ├── db-handlers.ts            # SQLite database operations
│   │   │   ├── fs-handlers.ts            # File system operations
│   │   │   ├── ai-handlers.ts            # AI model orchestration
│   │   │   └── system-handlers.ts        # App lifecycle, updates
│   │   ├── db/                           # Database layer
│   │   │   ├── connection.ts             # SQLite connection (better-sqlite3)
│   │   │   ├── migrations/               # SQL migration files
│   │   │   ├── repositories/             # Data access objects
│   │   │   │   ├── flow.repository.ts
│   │   │   │   ├── node.repository.ts
│   │   │   │   ├── execution.repository.ts
│   │   │   │   └── workspace.repository.ts
│   │   │   └── schema.ts                 # Database schema definitions
│   │   └── services/                     # Main process services
│   │       ├── auto-updater.ts
│   │       ├── flow-executor.ts          # Workflow execution engine
│   │       └── ai-service.ts             # AI model management
│   │
│   ├── preload/                          # Preload scripts
│   │   ├── index.ts                      # contextBridge API exposure
│   │   └── api.ts                        # Typed IPC API definition
│   │
│   └── renderer/                         # React application (FSD structure)
│       ├── index.html                    # Entry HTML
│       ├── main.tsx                      # React entry point
│       │
│       ├── app/                          # FSD: App layer
│       │   ├── index.tsx                 # App root component
│       │   ├── providers/                # Context providers
│       │   │   ├── ThemeProvider.tsx
│       │   │   └── ShortcutProvider.tsx
│       │   ├── router/                   # View routing (not URL-based)
│       │   │   ├── router.tsx            # State-based router
│       │   │   └── routes.ts             # Route definitions
│       │   └── styles/                   # Global styles
│       │       ├── globals.css           # Tailwind directives, base styles
│       │       ├── tokens.css            # Design tokens (@theme)
│       │       └── themes/
│       │           ├── dark.css
│       │           └── light.css
│       │
│       ├── pages/                        # FSD: Pages layer
│       │   ├── inbox/                   # PRIMARY page
│       │   │   ├── ui/
│       │   │   │   └── InboxPage.tsx
│       │   │   └── index.ts
│       │   ├── flow-editor/
│       │   │   ├── ui/
│       │   │   │   └── FlowEditorPage.tsx
│       │   │   └── index.ts
│       │   ├── execution-history/
│       │   │   ├── ui/
│       │   │   │   └── ExecutionHistoryPage.tsx
│       │   │   └── index.ts
│       │   ├── settings/
│       │   │   ├── ui/
│       │   │   │   └── SettingsPage.tsx
│       │   │   └── index.ts
│       │   └── plugin-marketplace/
│       │       ├── ui/
│       │       │   └── PluginMarketplacePage.tsx
│       │       └── index.ts
│       │
│       ├── widgets/                      # FSD: Widgets layer
│       │   ├── inbox-feed/
│       │   │   ├── ui/
│       │   │   │   ├── InboxFeed.tsx    # Unified inbox item list
│       │   │   │   └── InboxItemRow.tsx
│       │   │   └── index.ts
│       │   ├── detail-panel/
│       │   │   ├── ui/
│       │   │   │   ├── DetailPanel.tsx  # Context-sensitive item detail
│       │   │   │   └── GenericDetail.tsx # Fallback for unregistered types
│       │   │   └── index.ts
│       │   ├── ai-draft-panel/
│       │   │   ├── ui/
│       │   │   │   └── AIDraftPanel.tsx # AI-generated responses/actions
│       │   │   └── index.ts
│       │   ├── flow-canvas/
│       │   │   ├── ui/
│       │   │   │   ├── FlowCanvas.tsx
│       │   │   │   └── CanvasToolbar.tsx
│       │   │   └── index.ts
│       │   ├── node-palette/
│       │   │   ├── ui/
│       │   │   │   └── NodePalette.tsx
│       │   │   └── index.ts
│       │   ├── property-panel/
│       │   │   ├── ui/
│       │   │   │   └── PropertyPanel.tsx
│       │   │   └── index.ts
│       │   ├── execution-panel/
│       │   │   ├── ui/
│       │   │   │   ├── ExecutionPanel.tsx
│       │   │   │   └── ExecutionTimeline.tsx
│       │   │   └── index.ts
│       │   ├── ai-assistant/
│       │   │   ├── ui/
│       │   │   │   └── AIAssistant.tsx
│       │   │   └── index.ts
│       │   └── command-palette/
│       │       ├── ui/
│       │       │   └── CommandPalette.tsx
│       │       ├── model/
│       │       │   └── commands.ts
│       │       └── index.ts
│       │
│       ├── features/                     # FSD: Features layer
│       │   ├── inbox-filter/
│       │   │   ├── ui/
│       │   │   │   ├── InboxFilterBar.tsx
│       │   │   │   └── FilterPresets.tsx
│       │   │   ├── model/
│       │   │   │   └── inbox-filter.ts
│       │   │   └── index.ts
│       │   ├── inbox-actions/
│       │   │   ├── ui/
│       │   │   │   └── InboxActionBar.tsx
│       │   │   ├── model/
│       │   │   │   └── inbox-actions.ts  # Archive, snooze, mark-done, etc.
│       │   │   └── index.ts
│       │   ├── onboarding/
│       │   │   ├── ui/
│       │   │   │   ├── OnboardingWizard.tsx
│       │   │   │   └── PluginConnectStep.tsx
│       │   │   ├── model/
│       │   │   │   └── onboarding.ts
│       │   │   └── index.ts
│       │   ├── create-node/
│       │   │   ├── ui/
│       │   │   │   └── CreateNodeDialog.tsx
│       │   │   ├── model/
│       │   │   │   └── create-node.ts
│       │   │   └── index.ts
│       │   ├── execute-flow/
│       │   │   ├── ui/
│       │   │   │   └── ExecuteFlowButton.tsx
│       │   │   ├── model/
│       │   │   │   └── execute-flow.ts
│       │   │   ├── api/
│       │   │   │   └── execution-ipc.ts
│       │   │   └── index.ts
│       │   ├── configure-node/
│       │   │   ├── ui/
│       │   │   │   ├── NodeConfigForm.tsx
│       │   │   │   └── inputs/           # Per-node-type config inputs
│       │   │   ├── model/
│       │   │   │   └── node-config.ts
│       │   │   └── index.ts
│       │   ├── import-export/
│       │   │   ├── model/
│       │   │   │   └── import-export.ts
│       │   │   ├── api/
│       │   │   │   └── file-ipc.ts
│       │   │   └── index.ts
│       │   ├── ai-generate/
│       │   │   ├── ui/
│       │   │   │   └── AIGeneratePanel.tsx
│       │   │   ├── model/
│       │   │   │   └── ai-generate.ts
│       │   │   ├── api/
│       │   │   │   └── ai-ipc.ts
│       │   │   └── index.ts
│       │   └── undo-redo/
│       │       ├── model/
│       │       │   └── history.ts
│       │       └── index.ts
│       │
│       ├── entities/                     # FSD: Entities layer
│       │   ├── inbox-item/
│       │   │   ├── ui/
│       │   │   │   ├── InboxItemCard.tsx
│       │   │   │   └── InboxItemBadge.tsx
│       │   │   ├── model/
│       │   │   │   ├── inbox-store.ts    # Zustand store
│       │   │   │   └── inbox-item.types.ts
│       │   │   ├── api/
│       │   │   │   └── inbox-ipc.ts
│       │   │   └── index.ts
│       │   ├── plugin/
│       │   │   ├── ui/
│       │   │   │   ├── PluginCard.tsx
│       │   │   │   └── PluginStatus.tsx
│       │   │   ├── model/
│       │   │   │   ├── plugin-store.ts   # Zustand store
│       │   │   │   └── plugin.types.ts
│       │   │   ├── api/
│       │   │   │   └── plugin-ipc.ts
│       │   │   └── index.ts
│       │   ├── ai-provider/
│       │   │   ├── model/
│       │   │   │   ├── ai-store.ts       # Zustand store
│       │   │   │   └── ai-provider.types.ts
│       │   │   ├── api/
│       │   │   │   └── ai-ipc.ts
│       │   │   └── index.ts
│       │   ├── flow/
│       │   │   ├── ui/
│       │   │   │   └── FlowCard.tsx
│       │   │   ├── model/
│       │   │   │   ├── flow-store.ts     # Zustand store
│       │   │   │   └── flow.types.ts
│       │   │   ├── api/
│       │   │   │   └── flow-ipc.ts
│       │   │   └── index.ts
│       │   ├── node/
│       │   │   ├── ui/
│       │   │   │   ├── BaseNode.tsx
│       │   │   │   ├── TriggerNode.tsx
│       │   │   │   ├── ActionNode.tsx
│       │   │   │   ├── AINode.tsx
│       │   │   │   ├── ConditionNode.tsx
│       │   │   │   ├── LoopNode.tsx
│       │   │   │   └── SubflowNode.tsx
│       │   │   ├── model/
│       │   │   │   ├── node.types.ts
│       │   │   │   └── node-registry.ts
│       │   │   └── index.ts
│       │   ├── execution/
│       │   │   ├── ui/
│       │   │   │   ├── ExecutionRow.tsx
│       │   │   │   └── StepStatus.tsx
│       │   │   ├── model/
│       │   │   │   ├── execution-store.ts
│       │   │   │   └── execution.types.ts
│       │   │   └── index.ts
│       │   └── workspace/
│       │       ├── model/
│       │       │   ├── workspace-store.ts
│       │       │   └── workspace.types.ts
│       │       └── index.ts
│       │
│       └── shared/                       # FSD: Shared layer
│           ├── ui/                        # Design system components
│           │   ├── button.tsx
│           │   ├── input.tsx
│           │   ├── dialog.tsx
│           │   ├── dropdown-menu.tsx
│           │   ├── tooltip.tsx
│           │   ├── scroll-area.tsx
│           │   ├── skeleton.tsx
│           │   ├── badge.tsx
│           │   ├── toast.tsx
│           │   ├── resizable.tsx
│           │   ├── context-menu.tsx
│           │   ├── popover.tsx
│           │   ├── select.tsx
│           │   ├── switch.tsx
│           │   ├── tabs.tsx
│           │   └── ... (shadcn/ui components)
│           ├── lib/                       # Shared utilities
│           │   ├── cn.ts                  # Class name utility (clsx + twMerge)
│           │   ├── shortcuts.ts           # Keyboard shortcut registry
│           │   ├── ipc.ts                 # Typed IPC client wrapper
│           │   ├── format.ts              # Date, number formatting
│           │   └── debounce.ts            # Debounce/throttle utilities
│           ├── hooks/                     # Shared React hooks
│           │   ├── use-shortcut.ts        # Keyboard shortcut hook
│           │   ├── use-ipc.ts             # IPC query hook
│           │   ├── use-theme.ts           # Theme switching hook
│           │   └── use-resize-observer.ts # Element resize observer
│           ├── types/                     # Shared TypeScript types
│           │   ├── electron.d.ts          # Window.devrig type augmentation
│           │   ├── ipc.types.ts           # IPC channel and payload types
│           │   └── common.types.ts        # Shared utility types
│           └── config/                    # Shared configuration
│               ├── constants.ts           # App-wide constants
│               └── feature-flags.ts       # Feature flag definitions
│
├── resources/                             # Static assets for packaging
│   ├── icon.icns                          # macOS app icon
│   ├── icon.ico                           # Windows app icon
│   └── icon.png                           # Linux app icon
│
└── tests/
    ├── unit/                              # Vitest unit tests
    │   ├── stores/                        # Store logic tests
    │   └── utils/                         # Utility function tests
    ├── component/                         # Component tests
    │   └── ...
    └── e2e/                               # Playwright E2E tests
        ├── flow-editor.spec.ts
        ├── command-palette.spec.ts
        └── execution.spec.ts
```

### 11.1 Routing (State-Based, Not URL-Based)

Desktop apps do not use URL-based routing. DevRig uses a simple state-based router:

```tsx
// app/router/router.tsx
type Route =
  | { view: 'inbox' }
  | { view: 'inbox'; itemId: string }
  | { view: 'flow-editor'; flowId: string }
  | { view: 'execution-history' }
  | { view: 'settings'; section?: string }
  | { view: 'plugin-marketplace' };

const useRouterStore = create<{ route: Route; navigate: (r: Route) => void }>(
  (set) => ({
    route: { view: 'inbox' },
    navigate: (route) => set({ route }),
  })
);

function AppRouter() {
  const route = useRouterStore((s) => s.route);

  return (
    <Suspense fallback={<PageSkeleton />}>
      {route.view === 'inbox' && <InboxPage itemId={'itemId' in route ? route.itemId : undefined} />}
      {route.view === 'flow-editor' && <FlowEditorPage flowId={route.flowId} />}
      {route.view === 'execution-history' && <ExecutionHistoryPage />}
      {route.view === 'settings' && <SettingsPage section={route.section} />}
      {route.view === 'plugin-marketplace' && <PluginMarketplacePage />}
    </Suspense>
  );
}
```

The inbox is the default and primary route. Each page component is wrapped in `React.lazy()` for code splitting. The `Suspense` boundary shows a skeleton that matches the target page's layout.

---

## Appendix: Research Sources

### Linear Architecture

- [Reverse engineering Linear's sync magic](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/) -- Detailed analysis of Linear's IndexedDB, SyncAction, delta sync, and bootstrap patterns.
- [Linear's sync engine architecture](https://www.fujimon.com/blog/linear-sync-engine) -- StoreManager, MobX object graph, write/read paths, Last-Write-Wins conflict resolution.
- [Reverse-linear-sync-engine (GitHub)](https://github.com/wzhudev/reverse-linear-sync-engine) -- Endorsed by Tuomas Artman, reverse engineering of the sync engine codebase.
- [Tuomas Artman on devtools.fm (Episode 61)](https://www.devtools.fm/episode/61) -- CTO discusses architecture decisions, sync engine history, React+MobX+TypeScript stack.
- [Tuomas Artman on localfirst.fm (Episode 15)](https://www.localfirst.fm/15) -- Sync engines, startup MVP, local-first philosophy.
- [Tuomas Artman on X](https://x.com/artman/status/1119046856317652992) -- "A pretty basic stack. React, MobX, Typescript and Node with PostgreSQL. And some home-made sync magic."
- [How we redesigned the Linear UI](https://linear.app/now/how-we-redesigned-the-linear-ui) -- Foundational UI redesign principles.
- [Scaling the Linear Sync Engine](https://linear.app/now/scaling-the-linear-sync-engine) -- Production scaling challenges and solutions.
- [A Guide to Building Linear-like App For Developers](https://www.dhiwise.com/post/build-your-own-linear-app-developers-guide) -- Implementation patterns for Linear-style UIs.
- [Linear App Case Study: How to Build a $400M Issue Tracker](https://www.eleken.co/blog-posts/linear-app-case-study) -- Design and UX analysis.

### Electron Performance

- [Electron Performance Official Docs](https://www.electronjs.org/docs/latest/tutorial/performance) -- Official optimization recommendations.
- [Building High-Performance Electron Apps](https://www.johnnyle.io/read/electron-performance) -- Comprehensive performance guide.
- [6 Ways Slack, Notion, and VSCode Improved Electron App Performance](https://palette.dev/blog/improving-performance-of-electron-apps) -- Real-world optimization patterns from major Electron apps.
- [How to make your Electron app launch 1000ms faster](https://www.devas.life/how-to-make-your-electron-app-launch-1000ms-faster/) -- Startup time optimization techniques.
- [Advanced Electron.js architecture](https://blog.logrocket.com/advanced-electron-js-architecture/) -- IPC patterns, process architecture.
- [Electron IPC Documentation](https://www.electronjs.org/docs/latest/tutorial/ipc) -- Official IPC communication patterns.
- [electron-vite 5.0 Release](https://electron-vite.org/blog/) -- V8 bytecode, HMR, multi-threading support.

### React Performance

- [React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1) -- Official announcement, automatic memoization.
- [Meta's React Compiler 1.0 Brings Automatic Memoization to Production](https://www.infoq.com/news/2025/12/react-compiler-meta/) -- 12% faster loads, 2.5x faster interactions.
- [React Compiler Won't Save You From This Performance Mistake](https://medium.com/@domwozniak/react-compiler-wont-save-you-from-this-performance-mistake-a257541fe533) -- Spread operator re-render limitation.
- [useOptimistic - React](https://react.dev/reference/react/useOptimistic) -- Built-in optimistic update hook.

### React Flow

- [React Flow Official Site](https://reactflow.dev) -- Documentation, examples, API reference.
- [React Flow Performance Guide](https://reactflow.dev/learn/advanced-use/performance) -- Official memoization and optimization guidance.
- [React Flow Custom Nodes](https://reactflow.dev/learn/customization/custom-nodes) -- Custom node rendering patterns.
- [React Flow Workflow Editor Template](https://reactflow.dev/ui/templates/workflow-editor) -- First-party workflow editor template with ELKjs.
- [The ultimate guide to optimize React Flow project performance](https://medium.com/@lukasz.jazwa_32493/the-ultimate-guide-to-optimize-react-flow-project-performance-42f4297b2b7b) -- Performance testing data, optimization strategies.
- [xyflow Spring Update 2025](https://xyflow.com/blog/spring-update-2025) -- Latest library updates.
- [React Flow UI Components updated to React 19 and Tailwind CSS 4](https://reactflow.dev/whats-new/2025-10-28) -- React 19 and Tailwind v4 compatibility.
- [npm trends: react-flow vs rete](https://npmtrends.com/react-flow-vs-rete) -- Download comparison data.

### Design System

- [shadcn/ui](https://ui.shadcn.com/) -- Foundation for design system, copy-into-project component model.
- [Unified Radix UI Package (February 2026)](https://ui.shadcn.com/docs/changelog/2026-02-radix-ui) -- New unified radix-ui package.
- [Radix Themes vs shadcn/ui Comparison 2026](https://saasindie.com/blog/shadcn-vs-radix-themes-comparison) -- Architectural comparison.
- [shadcn UI Best Practices for 2026](https://medium.com/write-a-catalyst/shadcn-ui-best-practices-for-2026-444efd204f44) -- Scaling patterns.
- [Tailwind CSS v4.0](https://tailwindcss.com/blog/tailwindcss-v4) -- @theme directive, CSS-first configuration.
- [Tailwind CSS v4 @theme: The Future of Design Tokens](https://medium.com/@sureshdotariya/tailwind-css-4-theme-the-future-of-design-tokens-at-2025-guide-48305a26af06) -- Design tokens via CSS variables.
- [Tailwind CSS Best Practices 2025-2026](https://www.frontendtools.tech/blog/tailwind-css-best-practices-design-system-patterns) -- Design system patterns.
- [Headless UI alternatives: Radix, React Aria, Ark UI](https://blog.logrocket.com/headless-ui-alternatives-radix-primitives-react-aria-ark-ui/) -- Comparison of headless libraries.

### Animation

- [Motion (motion.dev)](https://motion.dev) -- Official site, hybrid WAAPI engine, 120fps GPU-accelerated animations.
- [Motion Animation Performance Guide](https://motion.dev/docs/performance) -- GPU acceleration, WAAPI vs JS engine selection.
- [Motion for React](https://motion.dev/docs/react) -- React integration, layout animations, gestures.
- [Micro animations in React with Framer Motion](https://jcofman.de/blog/micro-animations) -- Micro-interaction implementation patterns.
- [Skeleton loading screen design - perceived performance](https://blog.logrocket.com/ux-design/skeleton-loading-screen-design/) -- Perceived performance improvement techniques.

### State Management

- [Zustand vs Jotai Comparison](https://jotai.org/docs/basics/comparison) -- Official architectural comparison.
- [Zustand Comparison](https://zustand.docs.pmnd.rs/getting-started/comparison) -- Official Zustand comparison with alternatives.
- [Building Lightning-Fast UIs: Optimistic Updates with React Query and Zustand](https://medium.com/@anshulkahar2211/building-lightning-fast-uis-implementing-optimistic-updates-with-react-query-and-zustand-cfb7f9e7cd82) -- Optimistic update patterns.
- [Zundo: Undo/Redo Middleware for Zustand](https://github.com/charkour/zundo) -- Under 700 bytes, temporal state management.
- [Zustand Immer Middleware](https://zustand.docs.pmnd.rs/integrations/immer-middleware) -- Immutable state with mutable syntax.
- [Zustand Persisting Store Data](https://zustand.docs.pmnd.rs/integrations/persisting-store-data) -- Persistence middleware patterns.
- [Optimistic UI with RxDB](https://rxdb.info/articles/optimistic-ui.html) -- Local-first optimistic update architecture.
- [SignalDB Optimistic UI](https://signaldb.js.org/optimistic-ui/) -- How local databases transform user experience.

### Architecture

- [Feature-Sliced Design](https://feature-sliced.design/) -- Official documentation, layer structure, import rules.
- [Building Scalable Systems with React Architecture (FSD)](https://feature-sliced.design/blog/scalable-react-architecture) -- FSD in React applications.
- [5 Frontend Trends That Will Dominate 2026 (FSD)](https://feature-sliced.design/blog/frontend-trends-report) -- FSD adoption trends.

### Command Palette and Keyboard Navigation

- [cmdk (GitHub)](https://cmdk.paco.me/) -- Fast, unstyled command menu React component. Used by Linear, Raycast, Vercel.
- [cmdk npm](https://www.npmjs.com/package/cmdk) -- v1.1.1, 2572 dependent projects.
- [kbar (GitHub)](https://github.com/timc1/kbar) -- Alternative command palette library.
- [shadcn Command Component](https://www.shadcn.io/ui/command) -- shadcn/ui wrapper around cmdk.
- [Boost Your React App with a Sleek Command Palette Using cmdk](https://knowledge.buka.sh/boost-your-react-app-with-a-sleek-command-palette-using-cmdk/) -- Implementation guide.

### Virtual Scrolling

- [TanStack Virtual](https://tanstack.com/virtual/latest) -- 10-15KB, headless, 60fps virtualization.
- [How to speed up long lists with TanStack Virtual](https://blog.logrocket.com/speed-up-long-lists-tanstack-virtual/) -- Implementation patterns, dynamic row heights.
- [From Lag to Lightning: How TanStack Virtual Optimizes 1000s of Items](https://medium.com/@sanjivchaudhary416/from-lag-to-lightning-how-tanstack-virtual-optimizes-1000s-of-items-smoothly-24f0998dc444) -- Performance benchmarks.

### Framework Comparison

- [React vs Vue vs Svelte vs SolidJS 2025-2026](https://www.frontendtools.tech/blog/best-frontend-frameworks-2025-comparison) -- Bundle size, performance scores.
- [JS Bundle Size Guide: React 19, Vue 3, Svelte 5](https://www.frontendtools.tech/blog/reduce-javascript-bundle-size-2025) -- Framework bundle sizes.

---

*This document should be treated as the architectural source of truth for the DevRig frontend. All implementation decisions should reference this document. Deviations require documented rationale.*
