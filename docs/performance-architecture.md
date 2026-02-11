# DevRig Performance Engineering Guide

Version 1.0 | February 2026

This document defines the performance architecture for DevRig, a commercial Electron desktop application for workflow automation. The singular performance mandate is: **DevRig must feel as fast as Linear**. Every architectural decision, rendering strategy, and data access pattern documented here serves that goal.

---

## Table of Contents

1. [Performance Budget](#1-performance-budget)
2. [Startup Optimization](#2-startup-optimization)
3. [Rendering Performance](#3-rendering-performance)
4. [Database Performance (SQLite)](#4-database-performance-sqlite)
5. [Local-First Performance Patterns](#5-local-first-performance-patterns)
6. [Process Architecture](#6-process-architecture)
7. [Animation Performance](#7-animation-performance)
8. [Memory Management](#8-memory-management)
9. [Monitoring and Regression Testing](#9-monitoring-and-regression-testing)
10. [NAPI-RS for CPU-Intensive Operations](#10-napi-rs-for-cpu-intensive-operations)

---

## 1. Performance Budget

Every metric listed below is a hard budget. If any metric regresses past its threshold, the CI pipeline fails the build. No exceptions.

### Response Time Budgets

| Metric | Target | Failure Threshold | Measurement Point |
|---|---|---|---|
| Cold start to interactive | < 1.5s | > 2.0s | `app.on('ready')` to first meaningful paint with interactive UI |
| Hot start (from system tray) | < 200ms | > 300ms | Tray click to `BrowserWindow.show()` completion |
| Any UI click response | < 50ms | > 100ms | `pointerdown` event to first visible frame change |
| List scroll framerate | 60fps constant | < 55fps sustained | Chrome DevTools FPS meter, no dropped frames over 5s scroll |
| Flow builder (100+ nodes) | < 16ms frame time | > 20ms frame time | `requestAnimationFrame` callback delta during pan/zoom |

### Memory Budgets

| State | Target | Failure Threshold | Measurement |
|---|---|---|---|
| Idle (app open, no active workflow) | < 150MB | > 200MB | `process.memoryUsage().rss` after 30s idle |
| Active (large workflow, 500+ nodes) | < 400MB | > 500MB | Peak RSS during stress test scenario |
| After workflow close | < 175MB | > 250MB | RSS 60s after closing large workflow (leak detection) |

### Data Access Budgets

| Operation | Target | Failure Threshold | Measurement |
|---|---|---|---|
| SQLite read (indexed query) | < 1ms | > 3ms | `performance.mark()` around `db.prepare().get()` |
| SQLite write (single row) | < 2ms | > 5ms | Single INSERT/UPDATE in WAL mode |
| SQLite batch write (100 rows) | < 10ms | > 25ms | Transactional batch INSERT |
| IPC round-trip (main <-> renderer) | < 5ms | > 10ms | `ipcRenderer.invoke()` to resolved promise |
| IPC round-trip (renderer <-> worker) | < 3ms | > 8ms | MessagePort postMessage to response |

### Bundle Size Budgets

| Artifact | Target | Failure Threshold |
|---|---|---|
| Main process bundle | < 500KB | > 750KB |
| Renderer initial bundle (critical path) | < 300KB gzipped | > 500KB gzipped |
| Total renderer (all lazy chunks) | < 2MB gzipped | > 3MB gzipped |
| Native modules (unpacked) | < 15MB | > 25MB |

### Plugin and Inbox Performance Budgets

| Metric | Target | Failure Threshold | Measurement |
|---|---|---|---|
| Inbox render (1000 items) | < 16ms per frame | > 20ms per frame | `requestAnimationFrame` delta during continuous scroll |
| Plugin sync cycle (all plugins) | < 30s | > 60s | Wall time from sync start to all plugins complete |
| AI classification (per item) | < 3s | > 5s | Background, non-blocking; measured from enqueue to result cached |
| Plugin isolate creation | < 100ms | > 200ms | Time from `createIsolate()` to ready state |

These budgets apply to plugin-first and AI-augmented operations. AI classification and plugin sync are background operations that must never block the UI thread, but their completion time is budgeted to ensure the inbox converges to a fully classified state within a reasonable window.

---

## 2. Startup Optimization

Cold start is the first impression. Users who wait more than 2 seconds will perceive the app as sluggish regardless of how fast everything else is. The target of 1.5 seconds requires attacking every phase of the startup pipeline.

### 2.1 Startup Phase Breakdown

The cold start budget of 1.5 seconds is allocated across five phases:

```
Phase 1: Electron bootstrap     [0ms - 300ms]   300ms budget
Phase 2: Main process init      [300ms - 500ms]  200ms budget
Phase 3: Window creation + load [500ms - 800ms]  300ms budget
Phase 4: Renderer bootstrap     [800ms - 1100ms] 300ms budget
Phase 5: Data hydration         [1100ms - 1500ms] 300ms budget
                                                 ─────────────
                                        Total:   1500ms budget
```

### 2.2 V8 Code Cache and Bytecode Compilation

V8 must parse and compile JavaScript before execution. On first launch this is unavoidable, but subsequent launches can skip compilation entirely by using cached bytecode.

**electron-vite bytecode compilation** compiles main process and preload scripts to V8 bytecode (`.jsc` files) at build time. The renderer skips this because Chromium handles its own code caching for web content.

```ts
// electron-vite.config.ts
import { defineConfig, bytecodePlugin } from 'electron-vite';

export default defineConfig({
  main: {
    plugins: [
      bytecodePlugin({
        // Compile main process to bytecode
        transformArrowFunctions: true,
        removeBundleJS: true,
      }),
    ],
  },
  preload: {
    plugins: [
      bytecodePlugin(),
    ],
  },
  renderer: {
    // Renderer uses Chromium's own code cache; no bytecode plugin needed
  },
});
```

**V8 runtime code caching** provides an additional layer. After the first execution of renderer JavaScript, V8 stores compiled bytecode on disk. The second and subsequent launches load this cache, skipping the parse+compile phase entirely. Electron enables this by default, but it requires the script source to be identical across launches (hash-based filenames from Vite satisfy this).

Measured impact: V8 bytecode compilation reduces main process initialization by 40-60ms. Runtime code caching reduces renderer script evaluation by 100-200ms on warm starts.

### 2.3 Deferred Module Loading

The most significant startup bottleneck in Electron is `require()`. Each synchronous `require()` blocks the main thread while Node.js resolves, reads, parses, and evaluates the module. The critical path must load only what is needed for the first frame.

```ts
// main/index.ts - WRONG: eager loading blocks startup
import { initDatabase } from './database';
import { initSync } from './sync-engine';
import { initPlugins } from './plugin-manager';
import { initAutoUpdate } from './auto-updater';
import { initAnalytics } from './analytics';
import { initTray } from './tray';

// main/index.ts - CORRECT: tiered loading
// Phase 1: Only what's needed to show the window
import { createWindow } from './window';
import { registerCriticalIPC } from './ipc-critical';

app.on('ready', async () => {
  // Show window shell immediately (Phase 3)
  const mainWindow = createWindow();
  registerCriticalIPC(mainWindow);

  // Phase 4: Load after window is visible (non-blocking)
  setImmediate(async () => {
    const { initDatabase } = await import('./database');
    await initDatabase();

    const { initSync } = await import('./sync-engine');
    initSync(); // runs in background, does not block UI
  });

  // Phase 5: Load after data is available
  setTimeout(async () => {
    const { initPlugins } = await import('./plugin-manager');
    const { initAutoUpdate } = await import('./auto-updater');
    const { initAnalytics } = await import('./analytics');
    const { initTray } = await import('./tray');

    await Promise.all([
      initPlugins(),
      initAutoUpdate(),
      initAnalytics(),
      initTray(mainWindow),
    ]);
  }, 2000); // Well after the user sees the interactive UI
});
```

**Plugin loading strategy:** Plugin sandboxes are lazy-loaded after startup, never during the critical 1.5s cold-start window. First-party plugins (Linear, GitHub, etc.) are bundled and pre-compiled at build time for faster initialization. Plugin V8 isolates are pooled and recycled across executions to reduce memory overhead and amortize the cost of isolate creation. The `initPlugins()` call above only registers plugin metadata; actual isolate creation is deferred to the first invocation of each plugin.

### 2.4 Tiered Data Loading (Linear Pattern)

Linear's architecture demonstrates the gold standard for perceived startup performance. The app shows a functional shell immediately, then progressively hydrates with real data. DevRig adopts the same three-tier pattern:

**Tier 1 - Bootstrap (0-500ms):** Load the application shell, navigation structure, and last-viewed workspace metadata from a tiny JSON cache. The user sees a real-looking UI within 500ms, not a splash screen.

```ts
// renderer/bootstrap.ts
interface BootstrapCache {
  lastWorkspaceId: string;
  lastViewId: string;
  workspaceNames: Record<string, string>;
  sidebarState: SidebarState;
  theme: ThemeConfig;
}

const bootstrap = JSON.parse(
  localStorage.getItem('devrig_bootstrap') ?? '{}'
) as Partial<BootstrapCache>;

// Render the shell immediately with cached structure
renderAppShell(bootstrap);
```

**Tier 2 - Partial (500ms-1000ms):** Load the active workspace's workflow list, recent items, and pinned flows from SQLite. The list view becomes interactive.

```ts
// renderer/data-loader.ts
async function loadPartialData(workspaceId: string): Promise<void> {
  // These are fast local SQLite reads, not network calls
  const [workflows, recentItems, pinnedFlows] = await Promise.all([
    ipc.invoke('db:workflows:list', { workspaceId, limit: 50 }),
    ipc.invoke('db:recent:list', { limit: 20 }),
    ipc.invoke('db:pinned:list', { workspaceId }),
  ]);

  store.dispatch(hydrateWorkspace({ workflows, recentItems, pinnedFlows }));
}
```

**Tier 3 - Full (1000ms+):** Load remaining workspaces, historical data, plugin state, and initiate background sync with the server. This happens entirely in the background with zero UI jank.

```ts
// renderer/full-loader.ts
async function loadFullData(): Promise<void> {
  // Load in background, update store incrementally
  const allWorkspaces = await ipc.invoke('db:workspaces:listAll');
  store.dispatch(hydrateAllWorkspaces(allWorkspaces));

  // Trigger background sync (non-blocking)
  ipc.send('sync:start', { mode: 'incremental' });
}
```

### 2.5 Window Shell Strategy

The window must appear within 500ms of launch. This means creating and showing the `BrowserWindow` before all data is ready.

```ts
// main/window.ts
export function createWindow(): BrowserWindow {
  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false, // Don't show until ready-to-show
    backgroundColor: '#1a1a2e', // Match app background to prevent flash
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      backgroundThrottling: true,
      nodeIntegration: false,
    },
  });

  // Show as soon as the renderer has painted the shell
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Load the renderer entry point
  if (is.dev && process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}
```

### 2.6 Main Process Switches and Menu Optimization

Several Electron and Chromium flags reduce startup overhead:

```ts
// main/index.ts - apply before app.on('ready')

// Skip the default menu creation entirely
import { Menu } from 'electron';
Menu.setApplicationMenu(null);

// Chromium flags for startup performance
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer');

// GPU acceleration flags
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');

// Reduce V8 memory pressure during startup
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=256');
```

`Menu.setApplicationMenu(null)` is called before `app.on('ready')` because Electron constructs a default menu with keyboard shortcut registration during the ready event. Skipping this saves 20-50ms on macOS.

`CalculateNativeWinOcclusion` is a Windows-specific feature that checks if the window is occluded by other windows. Disabling it removes an unnecessary inter-process query on startup.

### 2.7 Hot Start from System Tray

When the user closes the window, DevRig hides it instead of destroying it. Re-showing a hidden window is near-instantaneous.

```ts
// main/tray.ts
mainWindow.on('close', (event) => {
  if (!app.isQuitting) {
    event.preventDefault();
    mainWindow.hide();
  }
});

tray.on('click', () => {
  if (mainWindow.isVisible()) {
    mainWindow.focus();
  } else {
    mainWindow.show(); // < 200ms because the renderer is already warm
  }
});
```

The hot start budget of 200ms is achievable because the renderer process remains alive with its V8 heap intact. No re-parsing, no re-evaluation, no data re-loading. The window simply becomes visible.

---

## 3. Rendering Performance

DevRig's renderer must maintain 60fps under all conditions: scrolling through thousands of workflow items, panning across a 500-node flow graph, or animating panel transitions. Every rendering decision is measured against the 16.67ms frame budget.

### 3.1 React 19 with React Compiler

React Compiler (v1.0, released October 2025) provides automatic memoization at build time, eliminating the majority of manual `useMemo`, `useCallback`, and `React.memo` optimization work. The compiler analyzes component dependency graphs and inserts granular memoization at the HIR (High-level Intermediate Representation) level.

Measured results from production applications: 20-30% reduction in render time, up to 2.5x faster interactions, and 10-15% INP improvements with neutral memory impact.

```ts
// babel.config.js
module.exports = {
  plugins: [
    ['babel-plugin-react-compiler', {
      // Compile all components; opt-out individual ones with 'use no memo'
      compilationMode: 'all',
      // Enable logging for compilation issues during development
      logger: {
        logEvent(filename, event) {
          if (event.kind === 'CompilationDiagnostic') {
            console.warn(`React Compiler: ${filename}`, event.detail);
          }
        },
      },
    }],
  ],
};
```

**When the compiler is not enough:** The compiler cannot prevent re-renders caused by genuinely new data (unstable references from hooks that return fresh objects on every call). For these cases, manual `useMemo` or structural changes are still required:

```tsx
// The compiler handles this automatically - no manual memo needed
function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const statusColor = getStatusColor(workflow.status);
  const formattedDate = formatDate(workflow.updatedAt);

  return (
    <div className="workflow-card" style={{ borderColor: statusColor }}>
      <h3>{workflow.name}</h3>
      <span>{formattedDate}</span>
    </div>
  );
}

// The compiler CANNOT fix this - data is genuinely new each render
// Manual optimization required
function WorkflowList({ workspaceId }: { workspaceId: string }) {
  const workflows = useWorkflows(workspaceId);

  // If useWorkflows returns a new array reference every render,
  // stabilize it with useMemo keyed on actual data identity
  const stableWorkflows = useMemo(
    () => workflows,
    [workflows.map(w => w.id + w.updatedAt).join(',')]
  );

  return <VirtualizedList items={stableWorkflows} />;
}
```

### 3.2 Virtual Scrolling with TanStack Virtual

Any list exceeding 50 items must use virtual scrolling. TanStack Virtual renders only the visible DOM elements plus a configurable overscan buffer, keeping the DOM node count constant regardless of list size. The library is framework-agnostic, roughly 10-15KB, and achieves 60fps scrolling with 10,000+ items.

```tsx
// components/workflow-list.tsx
import { useVirtualizer } from '@tanstack/react-virtual';

function WorkflowList({ workflows }: { workflows: Workflow[] }) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virtualizer = useVirtualizer({
    count: workflows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 64, // estimated row height in px
    overscan: 10, // render 10 extra items above/below viewport
    // Dynamic measurement for variable-height rows
    measureElement: (element) => element.getBoundingClientRect().height,
  });

  return (
    <div
      ref={parentRef}
      className="workflow-list-container"
      style={{ height: '100%', overflow: 'auto' }}
    >
      <div
        style={{
          height: `${virtualizer.getTotalSize()}px`,
          width: '100%',
          position: 'relative',
        }}
      >
        {virtualizer.getVirtualItems().map((virtualRow) => (
          <div
            key={virtualRow.key}
            data-index={virtualRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            <WorkflowCard workflow={workflows[virtualRow.index]} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

Key implementation details:
- Use `transform: translateY()` for positioning (compositor-only, no layout recalculation).
- Set `overscan: 10` to prevent visible blank space during fast scrolling.
- Use `measureElement` for variable-height rows; use `estimateSize` alone for fixed-height rows (faster).
- The parent container must have a fixed height and `overflow: auto`.

**Unified inbox rendering:** The unified inbox uses TanStack Virtual to render 1000+ items at 60fps. Inbox item components are memoized so that only the visible items plus the overscan buffer are rendered to the DOM. Plugin-provided views (e.g., Linear issue detail, GitHub PR detail) are lazy-loaded when the user selects an inbox item, not when the item scrolls into view. AI classification badges and priority summaries render from cached local data stored in SQLite, so no network calls occur during scroll. This ensures the inbox scroll performance is identical to a static list regardless of how many plugins contribute items.

### 3.3 CSS Containment

CSS containment tells the browser that a subtree is independent, allowing it to skip layout, style, and paint calculations for off-screen or unchanged sections.

```css
/* Isolate major layout sections */
.sidebar,
.main-content,
.properties-panel,
.toolbar {
  contain: layout style paint;
}

/* Flow builder canvas - fully isolated rendering */
.flow-canvas {
  contain: strict; /* equivalent to: contain: size layout style paint */
  will-change: transform; /* promote to its own compositor layer */
}

/* Individual workflow cards in lists */
.workflow-card {
  contain: layout style paint;
  content-visibility: auto;
  contain-intrinsic-size: auto 64px; /* prevent layout shift */
}

/* Off-screen panels (collapsed sidebar sections, hidden tabs) */
.panel-collapsed,
.tab-content:not(.active) {
  content-visibility: hidden;
}
```

`content-visibility: auto` is the highest-impact CSS performance property available. It tells the browser to skip rendering for elements outside the viewport entirely, including layout calculation, style resolution, and painting. On pages with many off-screen elements, initial render improves by up to 7x.

The `contain-intrinsic-size` declaration is mandatory when using `content-visibility: auto`. Without it, the browser assumes a height of 0 for unrendered elements, causing the scrollbar to jump erratically as elements enter the viewport.

### 3.4 GPU-Accelerated Transforms

Only two CSS properties are guaranteed to run on the GPU compositor thread without triggering layout or paint: `transform` and `opacity`. Every visual movement in DevRig must use these exclusively.

```css
/* CORRECT: compositor-only properties */
.panel-slide {
  transform: translateX(-100%);
  transition: transform 200ms cubic-bezier(0.2, 0, 0, 1);
}
.panel-slide.open {
  transform: translateX(0);
}

.fade-element {
  opacity: 0;
  transition: opacity 150ms ease-out;
}
.fade-element.visible {
  opacity: 1;
}

/* WRONG: triggers layout recalculation every frame */
.panel-slide-bad {
  left: -300px; /* DO NOT animate positional properties */
  transition: left 200ms ease;
}

/* WRONG: triggers paint every frame */
.color-change-bad {
  background-color: #1a1a2e; /* DO NOT animate color properties */
  transition: background-color 200ms ease;
}
```

Forbidden animation properties (trigger layout): `width`, `height`, `top`, `left`, `right`, `bottom`, `margin`, `padding`, `border-width`, `font-size`.

Forbidden animation properties (trigger paint): `background-color`, `color`, `box-shadow`, `border-color`, `outline`.

### 3.5 Layout Thrashing Prevention

Layout thrashing occurs when JavaScript interleaves DOM reads and writes, forcing the browser to recalculate layout multiple times per frame instead of once.

```ts
// WRONG: read-write-read-write forces 3 layout recalculations
function updateNodePositions(nodes: HTMLElement[]) {
  nodes.forEach((node) => {
    const height = node.offsetHeight;      // READ -> forces layout
    node.style.top = `${height * 2}px`;    // WRITE -> invalidates layout
    const width = node.offsetWidth;         // READ -> forces layout AGAIN
    node.style.left = `${width * 2}px`;    // WRITE -> invalidates layout
  });
}

// CORRECT: batch all reads, then batch all writes
function updateNodePositions(nodes: HTMLElement[]) {
  // Phase 1: Read all measurements
  const measurements = nodes.map((node) => ({
    height: node.offsetHeight,
    width: node.offsetWidth,
  }));

  // Phase 2: Write all changes (single layout recalculation)
  nodes.forEach((node, i) => {
    node.style.transform = `translate(${measurements[i].width * 2}px, ${measurements[i].height * 2}px)`;
  });
}

// BEST: use requestAnimationFrame to defer writes to the next frame
function updateNodePositions(nodes: HTMLElement[]) {
  const measurements = nodes.map((node) => ({
    height: node.offsetHeight,
    width: node.offsetWidth,
  }));

  requestAnimationFrame(() => {
    nodes.forEach((node, i) => {
      node.style.transform = `translate(${measurements[i].width * 2}px, ${measurements[i].height * 2}px)`;
    });
  });
}
```

For the flow builder canvas, use a single `requestAnimationFrame` loop that batches all node position updates per frame, regardless of how many nodes changed:

```ts
// flow-builder/render-loop.ts
class FlowRenderLoop {
  private dirty = new Set<string>();
  private scheduled = false;

  markDirty(nodeId: string): void {
    this.dirty.add(nodeId);
    if (!this.scheduled) {
      this.scheduled = true;
      requestAnimationFrame(() => this.flush());
    }
  }

  private flush(): void {
    this.scheduled = false;
    const updates = Array.from(this.dirty);
    this.dirty.clear();

    // Single batched DOM update for all dirty nodes
    updates.forEach((nodeId) => {
      const el = this.nodeElements.get(nodeId);
      const pos = this.nodePositions.get(nodeId);
      if (el && pos) {
        el.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
      }
    });
  }
}
```

---

## 4. Database Performance (SQLite)

SQLite is the local data store. Every read must complete in under 1ms. Every write must complete in under 2ms. The database is the foundation of the local-first architecture, so its performance directly determines the perceived speed of every interaction.

### 4.1 Pragma Configuration

These pragmas are applied once at database open time and persist for the connection lifetime:

```ts
// database/init.ts
import Database from 'better-sqlite3';

export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);

  // WAL mode: concurrent readers + single writer without blocking
  // Readers never block writers. Writers never block readers.
  db.pragma('journal_mode = WAL');

  // NORMAL synchronous: WAL is synced at critical moments only
  // Risk: last transaction may be lost on OS crash (not app crash)
  // Tradeoff: 5-10x faster writes vs FULL, acceptable for local-first
  db.pragma('synchronous = NORMAL');

  // Memory-map 256MB of the database file
  // The OS maps the file into virtual memory, eliminating read() syscalls
  // Pages are served directly from the page cache
  db.pragma('mmap_size = 268435456');

  // 64MB page cache in memory
  // Negative value = size in KiB (not page count)
  db.pragma('cache_size = -64000');

  // Store temp tables and indices in memory, not on disk
  db.pragma('temp_store = MEMORY');

  // Enable foreign keys (disabled by default in SQLite)
  db.pragma('foreign_keys = ON');

  // Increase busy timeout to 5s for rare write contention
  db.pragma('busy_timeout = 5000');

  // Optimize WAL checkpoint behavior
  // Auto-checkpoint after 1000 pages (~4MB with default page size)
  db.pragma('wal_autocheckpoint = 1000');

  return db;
}
```

### 4.2 Prepared Statement Caching

`better-sqlite3` compiles SQL to bytecode on `.prepare()`. This compilation is expensive relative to execution. A prepared statement cache ensures each query is compiled exactly once per connection.

```ts
// database/statement-cache.ts
import Database from 'better-sqlite3';

export class StatementCache {
  private cache = new Map<string, Database.Statement>();

  constructor(private db: Database.Database) {}

  prepare(sql: string): Database.Statement {
    let stmt = this.cache.get(sql);
    if (!stmt) {
      stmt = this.db.prepare(sql);
      this.cache.set(sql, stmt);
    }
    return stmt;
  }

  // Clear cache when schema changes (migrations)
  invalidate(): void {
    this.cache.clear();
  }
}

// Usage
const cache = new StatementCache(db);

// First call: compiles SQL to bytecode (~0.5ms)
// Subsequent calls: returns cached bytecode (~0.001ms)
const workflow = cache.prepare(
  'SELECT * FROM workflows WHERE id = ?'
).get(workflowId);
```

### 4.3 Transactional Batch Operations

Individual INSERTs in SQLite each initiate a transaction (fsync to disk). Wrapping N inserts in a single transaction reduces the cost from N fsyncs to 1 fsync. The improvement is roughly 100x for batch operations.

```ts
// database/batch.ts
export function batchInsertNodes(
  db: Database.Database,
  nodes: FlowNode[]
): void {
  const insert = db.prepare(`
    INSERT INTO flow_nodes (id, workflow_id, type, x, y, config, created_at)
    VALUES (@id, @workflowId, @type, @x, @y, @config, @createdAt)
  `);

  // Wrap all inserts in a single transaction
  const insertMany = db.transaction((nodes: FlowNode[]) => {
    for (const node of nodes) {
      insert.run({
        id: node.id,
        workflowId: node.workflowId,
        type: node.type,
        x: node.x,
        y: node.y,
        config: JSON.stringify(node.config),
        createdAt: node.createdAt,
      });
    }
  });

  insertMany(nodes);
}

// Performance comparison:
// 1000 individual INSERTs: ~3500ms (3.5ms each, 1 fsync each)
// 1000 INSERTs in one transaction: ~35ms (0.035ms each, 1 fsync total)
```

### 4.4 Index Strategy

Indexes are the difference between a 1ms query and a 100ms table scan. Every query that appears in a hot path must be covered by an index.

```sql
-- Primary access patterns and their indexes

-- Workflow listing: sorted by last modified, filtered by workspace
CREATE INDEX idx_workflows_workspace_updated
  ON workflows (workspace_id, updated_at DESC);

-- Flow node lookup: all nodes for a workflow
CREATE INDEX idx_flow_nodes_workflow
  ON flow_nodes (workflow_id);

-- Flow edge lookup: edges by source or target node
CREATE INDEX idx_flow_edges_source ON flow_edges (source_node_id);
CREATE INDEX idx_flow_edges_target ON flow_edges (target_node_id);

-- Execution history: recent executions for a workflow
CREATE INDEX idx_executions_workflow_started
  ON executions (workflow_id, started_at DESC);

-- Search: full-text search on workflow names and descriptions
-- Uses SQLite FTS5 for sub-millisecond text search
CREATE VIRTUAL TABLE workflows_fts USING fts5(
  name, description,
  content='workflows',
  content_rowid='rowid'
);

-- Sync tracking: find records that need syncing
CREATE INDEX idx_sync_queue_status
  ON sync_queue (status, created_at ASC);

-- Plugin data: fast lookup by plugin and key
CREATE INDEX idx_plugin_data_lookup
  ON plugin_data (plugin_id, key);

-- Unified inbox: main feed sorted by priority and recency
CREATE INDEX idx_inbox_items_status
  ON inbox_items (status, priority DESC, created_at DESC);

-- Unified inbox: plugin-scoped queries
CREATE INDEX idx_inbox_items_plugin
  ON inbox_items (plugin_id, status, created_at DESC);
```

**Inbox query pagination:** Inbox queries use cursor-based pagination (keyed on `(priority, created_at, id)`) instead of `OFFSET` to maintain consistent performance regardless of page depth. OFFSET-based pagination degrades linearly as the offset grows because SQLite must scan and discard rows. Cursor-based pagination uses the index directly, keeping every page fetch under 1ms.

**Batch sync inserts:** Plugin data sync uses transactional batch inserts for incoming items. As documented in section 4.3, wrapping N inserts in a single transaction reduces the cost from N fsyncs to 1 fsync, achieving roughly 100x improvement. Plugin sync batches default to 500 items per transaction.

**Index verification rule:** Run `EXPLAIN QUERY PLAN` for every query in the hot path. If the output shows `SCAN TABLE` instead of `SEARCH TABLE USING INDEX`, add a covering index.

```ts
// database/query-planner.ts (development only)
export function verifyQueryPlan(db: Database.Database, sql: string): void {
  const plan = db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all();
  for (const step of plan) {
    if (step.detail.includes('SCAN TABLE')) {
      console.warn(
        `[PERF] Full table scan detected: ${step.detail}\n  Query: ${sql}`
      );
    }
  }
}
```

### 4.5 Query Optimization Patterns

```ts
// WRONG: Loading all fields when only a few are needed
const workflows = cache.prepare('SELECT * FROM workflows WHERE workspace_id = ?').all(wsId);

// CORRECT: Select only needed columns (reduces I/O and memory)
const workflows = cache.prepare(`
  SELECT id, name, status, updated_at
  FROM workflows
  WHERE workspace_id = ?
  ORDER BY updated_at DESC
  LIMIT 50
`).all(wsId);

// WRONG: N+1 query pattern
const workflows = getWorkflows(wsId);
for (const wf of workflows) {
  wf.nodeCount = getNodeCount(wf.id); // N additional queries
}

// CORRECT: Single query with aggregation
const workflows = cache.prepare(`
  SELECT w.id, w.name, w.status, w.updated_at,
         COUNT(n.id) as node_count
  FROM workflows w
  LEFT JOIN flow_nodes n ON n.workflow_id = w.id
  WHERE w.workspace_id = ?
  GROUP BY w.id
  ORDER BY w.updated_at DESC
  LIMIT 50
`).all(wsId);
```

---

## 5. Local-First Performance Patterns

The local-first architecture is the single most important design decision for perceived performance. Every user action reads from and writes to the local SQLite database. The network is used only for synchronization, which happens entirely in the background. The user never waits for a network request.

### 5.1 Zero-Latency Local Reads

All reads go directly to SQLite. There is no network layer in the read path.

```ts
// data/workflow-repository.ts
export class WorkflowRepository {
  constructor(private stmtCache: StatementCache) {}

  // This completes in < 1ms. No network involved.
  getById(id: string): Workflow | null {
    return this.stmtCache.prepare(
      'SELECT * FROM workflows WHERE id = ?'
    ).get(id) as Workflow | null;
  }

  // List with pagination, < 1ms for indexed query
  list(workspaceId: string, offset = 0, limit = 50): Workflow[] {
    return this.stmtCache.prepare(`
      SELECT * FROM workflows
      WHERE workspace_id = ?
      ORDER BY updated_at DESC
      LIMIT ? OFFSET ?
    `).all(workspaceId, limit, offset) as Workflow[];
  }

  // Full-text search via FTS5, < 2ms for typical queries
  search(query: string, workspaceId: string): Workflow[] {
    return this.stmtCache.prepare(`
      SELECT w.* FROM workflows w
      JOIN workflows_fts fts ON fts.rowid = w.rowid
      WHERE workflows_fts MATCH ?
        AND w.workspace_id = ?
      ORDER BY rank
      LIMIT 20
    `).all(query, workspaceId) as Workflow[];
  }
}
```

### 5.2 Optimistic Writes

When the user creates, updates, or deletes something, the change is applied to the local database and the UI immediately. A sync record is enqueued for background transmission to the server. If the server rejects the change, a rollback mechanism reverses the local state and notifies the user.

```ts
// data/optimistic-write.ts
export class OptimisticWriter {
  constructor(
    private db: Database.Database,
    private stmtCache: StatementCache,
    private syncQueue: SyncQueue,
    private eventBus: EventBus
  ) {}

  async updateWorkflow(id: string, changes: Partial<Workflow>): Promise<void> {
    const now = Date.now();
    const previousState = this.stmtCache.prepare(
      'SELECT * FROM workflows WHERE id = ?'
    ).get(id) as Workflow;

    // Step 1: Write to local DB immediately (< 2ms)
    const setClauses = Object.keys(changes)
      .map((key) => `${key} = @${key}`)
      .join(', ');

    this.stmtCache.prepare(`
      UPDATE workflows SET ${setClauses}, updated_at = @updatedAt WHERE id = @id
    `).run({ ...changes, updatedAt: now, id });

    // Step 2: Emit event so UI updates immediately
    this.eventBus.emit('workflow:updated', { id, changes });

    // Step 3: Enqueue for background sync
    this.syncQueue.enqueue({
      type: 'workflow:update',
      entityId: id,
      payload: changes,
      previousState, // stored for rollback
      timestamp: now,
    });
  }
}
```

### 5.3 Background Sync via Worker Threads

The sync engine runs in a dedicated worker thread (not the main thread, not the renderer thread). This ensures that network latency, retry logic, and conflict resolution never block the UI.

```ts
// sync/sync-worker.ts (runs in worker_threads)
import { parentPort } from 'worker_threads';
import Database from 'better-sqlite3';

const db = new Database(dbPath);
// Apply same pragma configuration as main database connection

parentPort?.on('message', async (message) => {
  switch (message.type) {
    case 'sync:push': {
      const pending = db.prepare(`
        SELECT * FROM sync_queue
        WHERE status = 'pending'
        ORDER BY created_at ASC
        LIMIT 50
      `).all();

      for (const record of pending) {
        try {
          await pushToServer(record);
          db.prepare(
            'UPDATE sync_queue SET status = ? WHERE id = ?'
          ).run('synced', record.id);
        } catch (error) {
          db.prepare(
            'UPDATE sync_queue SET status = ?, error = ?, retry_count = retry_count + 1 WHERE id = ?'
          ).run('failed', error.message, record.id);
        }
      }

      parentPort?.postMessage({ type: 'sync:push:complete', count: pending.length });
      break;
    }

    case 'sync:pull': {
      const lastSyncTimestamp = db.prepare(
        'SELECT MAX(server_timestamp) as ts FROM sync_log'
      ).get().ts ?? 0;

      const changes = await fetchServerChanges(lastSyncTimestamp);
      applyServerChanges(db, changes);

      parentPort?.postMessage({ type: 'sync:pull:complete', count: changes.length });
      break;
    }
  }
});
```

### 5.4 Incremental Sync Protocol

The sync protocol transfers only changed records since the last successful sync, identified by server-side timestamps. This minimizes bandwidth and processing time.

```ts
// sync/incremental-sync.ts
interface SyncDelta {
  entityType: string;
  entityId: string;
  operation: 'create' | 'update' | 'delete';
  data: Record<string, unknown> | null;
  serverTimestamp: number;
}

async function fetchServerChanges(since: number): Promise<SyncDelta[]> {
  const response = await fetch(`${API_BASE}/sync/delta?since=${since}`, {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  return response.json();
}

function applyServerChanges(db: Database.Database, deltas: SyncDelta[]): void {
  const apply = db.transaction((deltas: SyncDelta[]) => {
    for (const delta of deltas) {
      switch (delta.operation) {
        case 'create':
        case 'update':
          upsertEntity(db, delta.entityType, delta.entityId, delta.data);
          break;
        case 'delete':
          deleteEntity(db, delta.entityType, delta.entityId);
          break;
      }
      // Record sync timestamp
      db.prepare(`
        INSERT OR REPLACE INTO sync_log (entity_type, entity_id, server_timestamp)
        VALUES (?, ?, ?)
      `).run(delta.entityType, delta.entityId, delta.serverTimestamp);
    }
  });

  apply(deltas);
}
```

### 5.5 Conflict Resolution

DevRig uses Last-Write-Wins (LWW) for most entities, following Linear's approach. For collaborative text fields (workflow descriptions, node comments), Yjs CRDTs provide merge-without-conflict semantics.

```ts
// sync/conflict-resolution.ts
function resolveConflict(local: SyncRecord, server: SyncDelta): 'keep-local' | 'accept-server' {
  // LWW: server timestamp wins ties because server is the source of truth
  if (server.serverTimestamp >= local.timestamp) {
    return 'accept-server';
  }

  // Local change is newer - it will be pushed in the next sync cycle
  return 'keep-local';
}
```

### 5.6 AI API Latency Management

AI operations (classify, summarize, draft) are inherently slow, typically 1-5 seconds per API call. This latency is incompatible with the sub-50ms interaction budget, so AI work must be fully decoupled from the UI interaction path.

**Fire-and-forget background processing:** When new inbox items arrive from plugin sync, AI classification and summarization requests are enqueued to a background task queue. The items appear in the inbox immediately with a "classifying..." skeleton state. The user can scroll, select, and interact with items before AI processing completes.

**Optimistic store updates:** When AI results return, they update the inbox items in-place via the Zustand store. The UI transitions from the skeleton to the final classification badge and summary without any full-list re-render, because only the affected item's component updates.

**Streaming responses for drafts:** Draft generation (AI-composed replies) uses streaming responses displayed character-by-character in the compose panel. This provides immediate feedback even though the full response takes 2-5 seconds to generate. The streaming connection runs in a dedicated async handler that does not block the renderer main thread.

**Local model fallback:** For offline scenarios or when low-latency classification is required, a lightweight local model provides fast classification at lower quality. The local model runs in a worker thread and returns results in under 100ms. When the device comes back online, items classified locally are re-classified by the cloud model in the background, and results are silently upgraded if they differ.

```ts
// services/ai-queue.ts
interface AITask {
  type: 'classify' | 'summarize' | 'draft';
  itemId: string;
  content: string;
  priority: number; // higher = process first
}

class AITaskQueue {
  private queue: AITask[] = [];
  private processing = false;
  private concurrency = 3; // max parallel API calls

  enqueue(task: AITask): void {
    this.queue.push(task);
    this.queue.sort((a, b) => b.priority - a.priority);
    this.processNext();
  }

  private async processNext(): Promise<void> {
    if (this.processing || this.queue.length === 0) return;
    this.processing = true;

    // Process up to `concurrency` tasks in parallel
    const batch = this.queue.splice(0, this.concurrency);
    await Promise.allSettled(
      batch.map(async (task) => {
        const result = await this.executeAITask(task);
        // Update inbox item in-place (optimistic store update)
        inboxStore.getState().updateItemAI(task.itemId, result);
        // Cache result in SQLite for future reads
        await ipc.invoke('db:inbox:updateAI', {
          id: task.itemId,
          ...result,
        });
      })
    );

    this.processing = false;
    if (this.queue.length > 0) this.processNext();
  }
}
```

---

## 6. Process Architecture

DevRig distributes work across multiple processes to keep the renderer responsive. No CPU-intensive work runs on the renderer's main thread.

### 6.1 Process Map

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DevRig Process Architecture               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────────────┐    IPC (invoke/handle)                    │
│  │    Main Process       │◄──────────────────────────┐              │
│  │    (Coordinator)      │                           │              │
│  │                       │    MessagePort             │              │
│  │  - App lifecycle      │◄────────────────────┐     │              │
│  │  - Window management  │                     │     │              │
│  │  - System tray        │                     │     │              │
│  │  - Global shortcuts   │                     │     │              │
│  │  - Auto-update        │                     │     │              │
│  └───────┬───────────────┘                     │     │              │
│          │                                     │     │              │
│          │  createWindow()                     │     │              │
│          ▼                                     │     │              │
│  ┌──────────────────────┐              ┌───────┴─────┴──────────┐  │
│  │   Renderer Process    │              │  Hidden Worker Window   │  │
│  │   (UI Thread)         │  MessagePort │  (Automation Engine)    │  │
│  │                       │◄────────────►│                         │  │
│  │  - React UI           │              │  - Workflow execution   │  │
│  │  - Local state (Zustand)             │  - Plugin sandboxing    │  │
│  │  - Virtual DOM        │              │  - Node evaluation      │  │
│  │  - Animation          │              │  - Long-running tasks   │  │
│  │  - User input         │              │                         │  │
│  └──────────────────────┘              └─────────────────────────┘  │
│                                                                     │
│  ┌──────────────────────┐              ┌─────────────────────────┐  │
│  │   UtilityProcess      │              │   Worker Threads         │  │
│  │   (Native Operations) │              │   (CPU-Intensive)        │  │
│  │                       │              │                          │  │
│  │  - better-sqlite3 ops │              │  - Data transformation   │  │
│  │  - File system I/O    │              │  - Background sync       │  │
│  │  - napi-rs modules    │              │  - Plugin execution      │  │
│  │  - Crypto operations  │              │  - Search indexing        │  │
│  └──────────────────────┘              └─────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Main Process: Lightweight Coordinator

The main process must remain lightweight. It coordinates IPC, manages windows, and delegates everything else. No database queries, no data processing, no network requests execute directly in the main process.

```ts
// main/index.ts
import { app, BrowserWindow, ipcMain } from 'electron';

// The main process is a router, not a worker
ipcMain.handle('db:query', async (_event, { sql, params }) => {
  // Delegate to UtilityProcess, do NOT run queries here
  return utilityProcess.invoke('db:query', { sql, params });
});

ipcMain.handle('automation:execute', async (_event, { workflowId }) => {
  // Delegate to hidden worker window
  return workerWindow.webContents.send('automation:execute', { workflowId });
});
```

### 6.3 Renderer: UI Only

The renderer process handles React rendering, user input, local state management, and animations. It communicates with other processes via IPC for data and computation.

```ts
// renderer/hooks/use-workflow.ts
export function useWorkflow(id: string): Workflow | null {
  const [workflow, setWorkflow] = useState<Workflow | null>(null);

  useEffect(() => {
    // IPC to UtilityProcess for SQLite read (< 5ms round-trip)
    window.api.invoke('db:workflow:get', { id }).then(setWorkflow);
  }, [id]);

  return workflow;
}
```

### 6.4 Hidden Worker Window

A hidden `BrowserWindow` runs the automation engine. It has full access to the renderer's capabilities (DOM APIs for HTML parsing, Canvas for image processing) without being visible to the user.

```ts
// main/worker-window.ts
export function createWorkerWindow(): BrowserWindow {
  const worker = new BrowserWindow({
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/worker.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  worker.loadFile(path.join(__dirname, '../renderer/worker.html'));
  return worker;
}
```

### 6.5 UtilityProcess for Native Code

Electron's `UtilityProcess` is preferred over `child_process.fork()` because it integrates with Electron's process model and supports `MessagePort` communication with renderer processes directly.

```ts
// main/utility.ts
import { utilityProcess } from 'electron';
import path from 'path';

const dbProcess = utilityProcess.fork(
  path.join(__dirname, '../utility/database-worker.js')
);

// The UtilityProcess runs better-sqlite3 in its own process
// This isolates the renderer from any SQLite blocking operations
dbProcess.on('message', (result) => {
  // Route result back to the requesting renderer
});
```

### 6.6 Worker Threads for CPU Work

Worker threads share memory with the main process via `SharedArrayBuffer` and `Atomics`, enabling zero-copy data transfer for large datasets.

```ts
// workers/data-transform.ts
import { Worker } from 'worker_threads';

export function transformDataAsync(data: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(
      path.join(__dirname, './transform-worker.js'),
      {
        workerData: { sharedBuffer: data.buffer },
      }
    );

    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', (code) => {
      if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
    });
  });
}
```

---

## 7. Animation Performance

Animations must feel instantaneous and physically grounded. The Motion library (successor to Framer Motion) provides a hybrid WAAPI/requestAnimationFrame engine that maintains 60fps even when the main thread is busy.

### 7.1 Motion Configuration

Motion's hybrid engine runs animations on the compositor thread via the Web Animations API when possible, falling back to requestAnimationFrame only for values that cannot be hardware-accelerated.

```tsx
// animations/spring-presets.ts
export const springPresets = {
  // Snappy interaction responses (button presses, toggles)
  snappy: {
    type: 'spring' as const,
    stiffness: 300,
    damping: 30,
    mass: 1,
    // Settles in ~150ms
  },

  // Panel slides and page transitions
  smooth: {
    type: 'spring' as const,
    stiffness: 200,
    damping: 25,
    mass: 1,
    // Settles in ~250ms
  },

  // Subtle micro-interactions (hover effects, focus rings)
  gentle: {
    type: 'spring' as const,
    stiffness: 400,
    damping: 40,
    mass: 0.8,
    // Settles in ~100ms
  },
} as const;
```

### 7.2 Animation Rules

```tsx
// components/animated-panel.tsx
import { motion, AnimatePresence } from 'motion/react';
import { springPresets } from '../animations/spring-presets';

function SidePanel({ isOpen, children }: SidePanelProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="side-panel"
          // ONLY animate transform and opacity - compositor-only properties
          initial={{ x: -320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: -320, opacity: 0 }}
          transition={springPresets.smooth}
          // layout animations use transform, not width/height
        >
          {children}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
```

### 7.3 Duration Limits

| Animation Type | Maximum Duration | Spring Preset |
|---|---|---|
| Button press / toggle | 100ms | `gentle` |
| Dropdown / popover open | 150ms | `snappy` |
| Panel slide | 200ms | `snappy` |
| Page / view transition | 300ms | `smooth` |
| Workflow node drag | 0ms (direct) | None (1:1 tracking) |

Anything over 300ms feels sluggish in a productivity application. The flow builder node dragging has zero animation delay: the node follows the cursor position directly via `transform: translate()` updated on every `pointermove` event.

### 7.4 Reduced Motion Support

```tsx
// animations/use-reduced-motion.ts
import { useReducedMotion } from 'motion/react';

export function useAnimationConfig() {
  const shouldReduceMotion = useReducedMotion();

  return {
    transition: shouldReduceMotion
      ? { duration: 0 }
      : springPresets.snappy,
    animate: shouldReduceMotion
      ? { opacity: 1 } // instant appear, skip positional animation
      : undefined,     // use component-defined animation
  };
}
```

```css
/* Global CSS fallback for non-Motion animations */
@media (prefers-reduced-motion: reduce) {
  *,
  *::before,
  *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}
```

---

## 8. Memory Management

Electron applications are uniquely prone to memory leaks because they combine three memory domains: the V8 heap (JavaScript objects), Chromium's rendering memory (DOM, layers, bitmaps), and native memory (Node.js buffers, native modules). A leak in any domain accumulates over the application's long-running lifetime.

### 8.1 Memory Budget Enforcement

```ts
// monitoring/memory-monitor.ts
const MEMORY_BUDGETS = {
  idle: 150 * 1024 * 1024,     // 150MB
  active: 400 * 1024 * 1024,   // 400MB
  critical: 500 * 1024 * 1024, // 500MB - trigger emergency GC
} as const;

class MemoryMonitor {
  private interval: NodeJS.Timeout | null = null;

  start(): void {
    this.interval = setInterval(() => this.check(), 30_000); // every 30s
  }

  private check(): void {
    const usage = process.memoryUsage();
    const rss = usage.rss;

    if (rss > MEMORY_BUDGETS.critical) {
      console.error(`[MEMORY] CRITICAL: ${(rss / 1024 / 1024).toFixed(0)}MB RSS`);
      // Force garbage collection if available
      if (global.gc) global.gc();
      // Notify renderer to release caches
      mainWindow?.webContents.send('memory:pressure', 'critical');
    } else if (rss > MEMORY_BUDGETS.active) {
      console.warn(`[MEMORY] HIGH: ${(rss / 1024 / 1024).toFixed(0)}MB RSS`);
      mainWindow?.webContents.send('memory:pressure', 'high');
    }

    // Report to monitoring
    telemetry.gauge('memory.rss', rss);
    telemetry.gauge('memory.heapUsed', usage.heapUsed);
    telemetry.gauge('memory.external', usage.external);
  }

  stop(): void {
    if (this.interval) clearInterval(this.interval);
  }
}
```

### 8.2 WeakRef and FinalizationRegistry for Caches

Caches that hold references to large objects must use `WeakRef` to allow garbage collection when memory pressure increases. `FinalizationRegistry` provides a callback when the object is collected, enabling cleanup of associated resources.

```ts
// cache/workflow-cache.ts
class WorkflowCache {
  private cache = new Map<string, WeakRef<Workflow>>();
  private registry = new FinalizationRegistry<string>((id) => {
    // Clean up the Map entry when the Workflow is garbage collected
    this.cache.delete(id);
  });

  get(id: string): Workflow | undefined {
    const ref = this.cache.get(id);
    if (!ref) return undefined;

    const workflow = ref.deref();
    if (!workflow) {
      // Object was garbage collected; clean up
      this.cache.delete(id);
      return undefined;
    }

    return workflow;
  }

  set(id: string, workflow: Workflow): void {
    const ref = new WeakRef(workflow);
    this.cache.set(id, ref);
    this.registry.register(workflow, id);
  }

  // Respond to memory pressure by clearing all weak refs
  onMemoryPressure(): void {
    this.cache.clear();
  }
}
```

### 8.3 IPC Listener Cleanup

IPC listeners that are not removed when a window closes are a common source of memory leaks in Electron. Every `ipcMain.on()` or `ipcMain.handle()` registered for a specific window must be removed when that window is destroyed.

```ts
// ipc/scoped-ipc.ts
export class ScopedIPC {
  private handlers: Array<{ channel: string; handler: Function }> = [];

  handle(channel: string, handler: Function): void {
    ipcMain.handle(channel, handler as any);
    this.handlers.push({ channel, handler });
  }

  on(channel: string, handler: Function): void {
    ipcMain.on(channel, handler as any);
    this.handlers.push({ channel, handler });
  }

  // Call this when the associated BrowserWindow is destroyed
  dispose(): void {
    for (const { channel, handler } of this.handlers) {
      ipcMain.removeHandler(channel);
      ipcMain.removeListener(channel, handler as any);
    }
    this.handlers = [];
  }
}

// Usage
const windowIPC = new ScopedIPC();
windowIPC.handle('db:query', handleQuery);
windowIPC.handle('db:write', handleWrite);

mainWindow.on('closed', () => {
  windowIPC.dispose(); // All handlers removed, no leaks
});
```

### 8.4 Renderer-Side Memory Management

```ts
// renderer/hooks/use-cleanup.ts
import { useEffect, useRef } from 'react';

// Ensure all subscriptions, timers, and listeners are cleaned up
export function useCleanup(cleanup: () => void): void {
  const cleanupRef = useRef(cleanup);
  cleanupRef.current = cleanup;

  useEffect(() => {
    return () => cleanupRef.current();
  }, []);
}

// Listen for memory pressure from main process
export function useMemoryPressure(onPressure: (level: string) => void): void {
  useEffect(() => {
    const handler = (_event: unknown, level: string) => onPressure(level);
    window.api.on('memory:pressure', handler);
    return () => window.api.removeListener('memory:pressure', handler);
  }, [onPressure]);
}
```

### 8.5 Background Throttling

Electron's `backgroundThrottling` option (enabled by default) reduces timer resolution and CPU usage when the window is not focused. This is critical for battery life on laptops and for limiting memory growth from background timers.

```ts
// Ensure backgroundThrottling is enabled (it is by default, but be explicit)
const mainWindow = new BrowserWindow({
  webPreferences: {
    backgroundThrottling: true,
  },
});

// For the hidden worker window, disable throttling so
// workflow executions continue at full speed
const workerWindow = new BrowserWindow({
  show: false,
  webPreferences: {
    backgroundThrottling: false, // Worker must continue at full speed
  },
});
```

### 8.6 Periodic GC Hints

When the application transitions from an active state (editing a large workflow) to idle, explicitly hint to V8 that it should run garbage collection.

```ts
// Start Electron with --expose-gc flag in production
app.commandLine.appendSwitch('js-flags', '--expose-gc');

// After closing a large workflow, hint GC
function onWorkflowClosed(): void {
  // Clear caches first
  workflowCache.onMemoryPressure();
  nodeCache.onMemoryPressure();

  // Request GC on next idle
  if (global.gc) {
    setTimeout(() => {
      global.gc!();
    }, 1000); // Wait 1s for cleanup to propagate
  }
}
```

### 8.7 Plugin and Inbox Memory Budgets

**Plugin isolate memory:** Each plugin runs in an isolated-vm V8 isolate with a hard 128MB memory limit. When the limit is reached, the isolate is terminated and restarted. Pooled isolates share a common memory allocation strategy: idle isolates are suspended and their heap snapshots are stored, then restored on demand. This keeps the total plugin memory footprint bounded regardless of how many plugins are installed.

**Inbox item memory:** The unified inbox stores only visible items plus lightweight metadata (id, title, status, priority, plugin source) in the Zustand store. Full item bodies, AI summaries, and attachment data are loaded on demand from SQLite when the user selects an item. This prevents the inbox from consuming unbounded memory as the item count grows.

**AI response caching:** AI classifications (priority, category, sentiment) and summaries are computed once and cached in SQLite alongside the inbox item. Subsequent views read from the cache, not from the AI API. Cache invalidation occurs only when the source item is updated by the plugin sync. This eliminates redundant API calls and keeps AI-related memory usage constant per item.

**Plugin data sync memory:** Plugin data sync runs in the background with memory-bounded batch sizes (default: 500 items per batch). Each batch is processed and committed to SQLite before the next batch is fetched, preventing unbounded memory growth during large syncs. Back-pressure is applied if the sync queue grows beyond 10,000 pending items.

### 8.8 Memory Leak Detection in Development

Use `memlab` from Meta for automated heap analysis during development and CI:

```ts
// tests/memory/leak-detection.test.ts
// Run with: npx memlab run --scenario ./tests/memory/workflow-scenario.js

// memlab scenario file
function url() {
  return 'http://localhost:5173'; // Dev server URL
}

async function action(page) {
  // Open a large workflow
  await page.click('[data-testid="workflow-large"]');
  await page.waitForSelector('[data-testid="flow-canvas"]');
}

async function back(page) {
  // Navigate away (should release workflow memory)
  await page.click('[data-testid="nav-home"]');
  await page.waitForSelector('[data-testid="workflow-list"]');
}

module.exports = { url, action, back };
```

---

## 9. Monitoring and Regression Testing

Performance gains are meaningless if they regress silently. Every metric in the performance budget is continuously measured, tracked, and enforced in CI.

### 9.1 Performance Marks and Measures

Instrument the critical path with `performance.mark()` and `performance.measure()`:

```ts
// renderer/performance-marks.ts
export const PerfMarks = {
  // Startup milestones
  APP_READY: 'app:ready',
  WINDOW_CREATED: 'window:created',
  RENDERER_LOADED: 'renderer:loaded',
  SHELL_PAINTED: 'shell:painted',
  DATA_PARTIAL: 'data:partial',
  DATA_FULL: 'data:full',
  INTERACTIVE: 'app:interactive',

  // Interaction milestones
  CLICK_START: 'click:start',
  CLICK_RESPONSE: 'click:response',

  // Navigation milestones
  NAV_START: 'nav:start',
  NAV_COMPLETE: 'nav:complete',
} as const;

// Main process marks
app.on('ready', () => {
  performance.mark(PerfMarks.APP_READY);
});

// Renderer marks
document.addEventListener('DOMContentLoaded', () => {
  performance.mark(PerfMarks.RENDERER_LOADED);
});

// Measure startup duration
function measureStartup(): void {
  performance.mark(PerfMarks.INTERACTIVE);
  performance.measure('startup:total', PerfMarks.APP_READY, PerfMarks.INTERACTIVE);
  performance.measure('startup:shell', PerfMarks.RENDERER_LOADED, PerfMarks.SHELL_PAINTED);
  performance.measure('startup:hydration', PerfMarks.SHELL_PAINTED, PerfMarks.INTERACTIVE);

  const startup = performance.getEntriesByName('startup:total')[0];
  console.log(`[PERF] Total startup: ${startup.duration.toFixed(0)}ms`);

  // Report to monitoring
  telemetry.histogram('startup.total', startup.duration);
}
```

### 9.2 Electron contentTracing API

The `contentTracing` API captures Chromium-level trace events, including GPU activity, layout calculations, and V8 execution. Use it for deep startup profiling.

```ts
// main/startup-trace.ts
import { contentTracing } from 'electron';

async function captureStartupTrace(): Promise<string> {
  await contentTracing.startRecording({
    included_categories: [
      'v8',
      'v8.execute',
      'blink',
      'blink.user_timing',
      'loading',
      'navigation',
      'renderer.scheduler',
      'toplevel',
      'gpu',
    ],
    // Record for the startup window only
  });

  // Wait for the app to become interactive
  await waitForInteractive();

  const traceFilePath = await contentTracing.stopRecording();
  // traceFilePath contains a JSON file loadable in chrome://tracing
  return traceFilePath;
}

// Enable startup tracing with environment variable
if (process.env.DEVRIG_TRACE_STARTUP === '1') {
  app.on('ready', () => {
    captureStartupTrace().then((path) => {
      console.log(`[PERF] Startup trace written to: ${path}`);
    });
  });
}
```

The output file can be loaded in `chrome://tracing` or Perfetto for frame-by-frame analysis of where startup time is spent.

### 9.3 Automated Performance Tests in CI

Playwright drives Electron for end-to-end performance testing. These tests run on every PR and fail the build if budgets are exceeded.

```ts
// tests/performance/startup.perf.ts
import { test, expect } from '@playwright/test';
import { _electron as electron } from 'playwright';

test.describe('Performance Budgets', () => {
  test('cold start completes within 2 seconds', async () => {
    const startTime = performance.now();

    const app = await electron.launch({
      args: ['.'],
      env: { NODE_ENV: 'production' },
    });

    const window = await app.firstWindow();

    // Wait for the interactive marker
    await window.waitForFunction(() => {
      return performance.getEntriesByName('app:interactive').length > 0;
    }, { timeout: 5000 });

    const entries = await window.evaluate(() => {
      const measure = performance.getEntriesByName('startup:total')[0];
      return { duration: measure?.duration ?? Infinity };
    });

    expect(entries.duration).toBeLessThan(2000); // Failure threshold

    await app.close();
  });

  test('memory stays under 200MB after idle', async () => {
    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    // Wait for full load, then idle for 30 seconds
    await window.waitForFunction(() => {
      return performance.getEntriesByName('data:full').length > 0;
    });
    await new Promise((r) => setTimeout(r, 30_000));

    const memoryInfo = await window.evaluate(() => {
      return (performance as any).memory?.usedJSHeapSize ?? 0;
    });

    // Chromium's performance.memory reports JS heap only
    // RSS is checked separately via process metrics
    expect(memoryInfo).toBeLessThan(200 * 1024 * 1024);

    await app.close();
  });

  test('IPC round-trip under 10ms', async () => {
    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    const ipcLatency = await window.evaluate(async () => {
      const iterations = 100;
      const start = performance.now();
      for (let i = 0; i < iterations; i++) {
        await (window as any).api.invoke('ping');
      }
      return (performance.now() - start) / iterations;
    });

    expect(ipcLatency).toBeLessThan(10); // 10ms failure threshold

    await app.close();
  });

  test('scroll maintains 55+ fps for 5 seconds', async () => {
    const app = await electron.launch({ args: ['.'] });
    const window = await app.firstWindow();

    // Navigate to a view with a long list
    await window.click('[data-testid="nav-workflows"]');
    await window.waitForSelector('[data-testid="workflow-list"]');

    // Collect frame times during scroll
    const frameTimes = await window.evaluate(async () => {
      const times: number[] = [];
      let lastTime = performance.now();

      return new Promise<number[]>((resolve) => {
        const container = document.querySelector('[data-testid="workflow-list"]')!;
        let scrolled = 0;

        function frame() {
          const now = performance.now();
          times.push(now - lastTime);
          lastTime = now;

          container.scrollTop += 5;
          scrolled += 5;

          if (scrolled < 5000) {
            requestAnimationFrame(frame);
          } else {
            resolve(times);
          }
        }

        requestAnimationFrame(frame);
      });
    });

    // Calculate FPS from frame times
    const avgFrameTime = frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length;
    const avgFps = 1000 / avgFrameTime;

    expect(avgFps).toBeGreaterThan(55); // Must stay above 55fps

    await app.close();
  });
});
```

### 9.4 CI Pipeline Configuration

```yaml
# .github/workflows/performance.yml
name: Performance Budget Check

on:
  pull_request:
    branches: [main]

jobs:
  performance:
    runs-on: ubuntu-latest
    timeout-minutes: 15

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install dependencies
        run: npm ci

      - name: Build production
        run: npm run build

      - name: Check bundle sizes
        run: |
          MAIN_SIZE=$(stat -f%z dist/main/index.js 2>/dev/null || stat -c%s dist/main/index.js)
          RENDERER_SIZE=$(stat -f%z dist/renderer/index.js 2>/dev/null || stat -c%s dist/renderer/index.js)

          echo "Main bundle: ${MAIN_SIZE} bytes"
          echo "Renderer bundle: ${RENDERER_SIZE} bytes"

          # Fail if main bundle exceeds 750KB
          if [ "$MAIN_SIZE" -gt 768000 ]; then
            echo "FAIL: Main bundle exceeds 750KB budget"
            exit 1
          fi

      - name: Run performance tests
        run: npx playwright test tests/performance/ --reporter=json > perf-results.json
        env:
          DISPLAY: ':99'

      - name: Upload performance results
        uses: actions/upload-artifact@v4
        with:
          name: performance-results
          path: perf-results.json

      - name: Comment PR with results
        uses: actions/github-script@v7
        with:
          script: |
            const results = require('./perf-results.json');
            // Format and post performance summary to PR
```

### 9.5 Sentry Performance Monitoring

Sentry provides real-user performance metrics from production installs, revealing performance problems that CI testing cannot catch (slow machines, constrained memory, antivirus interference).

```ts
// renderer/sentry-init.ts
import * as Sentry from '@sentry/electron/renderer';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  tracesSampleRate: 0.1, // 10% of sessions
  profilesSampleRate: 0.05, // 5% of sessions get CPU profiling
  integrations: [
    Sentry.browserTracingIntegration({
      // Track navigation between views
      enableInp: true,
    }),
    Sentry.browserProfilingIntegration(),
  ],

  // Custom performance spans
  beforeSendTransaction(transaction) {
    // Drop transactions that are within budget (only track slow ones)
    const startupSpan = transaction.spans?.find(
      (s) => s.op === 'app.startup'
    );
    if (startupSpan && startupSpan.timestamp - startupSpan.start_timestamp < 2) {
      return null; // Don't send normal startup transactions
    }
    return transaction;
  },
});

// Custom startup span
const startupTransaction = Sentry.startTransaction({
  name: 'app.startup',
  op: 'app.startup',
});

// Mark phases
startupTransaction.startChild({ op: 'shell.render' }).finish();
startupTransaction.startChild({ op: 'data.partial' }).finish();
startupTransaction.startChild({ op: 'data.full' }).finish();
startupTransaction.finish();
```

```ts
// main/sentry-init.ts
import * as Sentry from '@sentry/electron/main';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  // Track main process performance
  integrations: [
    Sentry.electronMinidumpIntegration(),
  ],
});
```

### 9.6 Performance Dashboard Metrics

Track these metrics over time to detect regressions:

| Metric | Source | Alert Threshold |
|---|---|---|
| p50 startup time | Sentry | > 1.5s |
| p95 startup time | Sentry | > 3.0s |
| p50 IPC latency | Custom telemetry | > 5ms |
| p95 memory (idle) | Sentry | > 200MB |
| p95 memory (active) | Sentry | > 450MB |
| Dropped frames per session | Sentry | > 50 |
| JS crash rate | Sentry | > 0.5% |
| Memory leak rate (MB/hour) | Custom | > 10MB/hour |

---

## 10. NAPI-RS for CPU-Intensive Operations

JavaScript is not suitable for CPU-bound operations that must complete within the 16ms frame budget. NAPI-RS compiles Rust code to native Node.js addons, delivering 10-50x performance improvements for compute-heavy tasks while maintaining memory safety guarantees.

### 10.1 Target Operations

| Operation | JS Performance | Rust (napi-rs) | Improvement |
|---|---|---|---|
| SHA-256 hash (200MB file) | ~800ms | ~75ms | 10.7x |
| JSON data transform (100K records) | ~450ms | ~40ms | 11.3x |
| File watcher (recursive, 10K files) | ~200ms init | ~20ms init | 10x |
| Workflow graph validation (500 nodes) | ~120ms | ~8ms | 15x |
| CRDT merge (large document) | ~300ms | ~25ms | 12x |
| Text search (100K records, no FTS) | ~600ms | ~50ms | 12x |

### 10.2 Project Structure

```
native/
├── Cargo.toml
├── src/
│   ├── lib.rs           # napi-rs entry point
│   ├── hasher.rs        # File hashing (SHA-256, BLAKE3)
│   ├── transform.rs     # Data transformation pipelines
│   ├── graph.rs         # Workflow graph algorithms
│   ├── watcher.rs       # Native file system watcher
│   └── search.rs        # Fast text search
├── build.rs
└── npm/                 # Platform-specific prebuilt binaries
    ├── darwin-arm64/
    ├── darwin-x64/
    ├── win32-x64/
    └── linux-x64/
```

### 10.3 Implementation Example

```toml
# native/Cargo.toml
[package]
name = "devrig-native"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib"]

[dependencies]
napi = { version = "2", features = ["napi9", "async", "serde-json"] }
napi-derive = "2"
sha2 = "0.10"
blake3 = "1"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
rayon = "1" # parallel iterators for data transforms
notify = "7" # cross-platform file watcher

[build-dependencies]
napi-build = "2"

[profile.release]
lto = true
codegen-units = 1
opt-level = 3
strip = true
```

```rust
// native/src/hasher.rs
use napi::bindgen_prelude::*;
use napi_derive::napi;
use sha2::{Digest, Sha256};
use std::fs::File;
use std::io::Read;

#[napi]
pub fn hash_file_sha256(path: String) -> Result<String> {
    let mut file = File::open(&path)
        .map_err(|e| Error::from_reason(format!("Failed to open file: {e}")))?;

    let mut hasher = Sha256::new();
    let mut buffer = [0u8; 65536]; // 64KB read buffer

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|e| Error::from_reason(format!("Read error: {e}")))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(format!("{:x}", hasher.finalize()))
}

#[napi]
pub fn hash_file_blake3(path: String) -> Result<String> {
    let mut file = File::open(&path)
        .map_err(|e| Error::from_reason(format!("Failed to open file: {e}")))?;

    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0u8; 65536];

    loop {
        let bytes_read = file
            .read(&mut buffer)
            .map_err(|e| Error::from_reason(format!("Read error: {e}")))?;
        if bytes_read == 0 {
            break;
        }
        hasher.update(&buffer[..bytes_read]);
    }

    Ok(hasher.finalize().to_hex().to_string())
}
```

```rust
// native/src/graph.rs
use napi::bindgen_prelude::*;
use napi_derive::napi;
use std::collections::{HashMap, HashSet, VecDeque};

#[napi(object)]
pub struct GraphEdge {
    pub source: String,
    pub target: String,
}

#[napi(object)]
pub struct ValidationResult {
    pub is_valid: bool,
    pub has_cycles: bool,
    pub unreachable_nodes: Vec<String>,
    pub orphan_edges: Vec<String>,
}

#[napi]
pub fn validate_workflow_graph(
    node_ids: Vec<String>,
    edges: Vec<GraphEdge>,
) -> ValidationResult {
    let node_set: HashSet<&str> = node_ids.iter().map(|s| s.as_str()).collect();

    // Build adjacency list
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();
    let mut orphan_edges = Vec::new();

    for edge in &edges {
        if !node_set.contains(edge.source.as_str())
            || !node_set.contains(edge.target.as_str())
        {
            orphan_edges.push(format!("{} -> {}", edge.source, edge.target));
            continue;
        }
        adj.entry(edge.source.as_str())
            .or_default()
            .push(edge.target.as_str());
    }

    // Cycle detection via DFS with coloring
    let has_cycles = detect_cycles(&node_ids, &adj);

    // Reachability analysis via BFS from entry nodes (nodes with no incoming edges)
    let incoming: HashSet<&str> = edges.iter().map(|e| e.target.as_str()).collect();
    let entry_nodes: Vec<&str> = node_ids
        .iter()
        .filter(|n| !incoming.contains(n.as_str()))
        .map(|s| s.as_str())
        .collect();

    let reachable = bfs_reachable(&entry_nodes, &adj);
    let unreachable_nodes: Vec<String> = node_ids
        .iter()
        .filter(|n| !reachable.contains(n.as_str()))
        .cloned()
        .collect();

    ValidationResult {
        is_valid: !has_cycles && unreachable_nodes.is_empty() && orphan_edges.is_empty(),
        has_cycles,
        unreachable_nodes,
        orphan_edges,
    }
}

fn detect_cycles(nodes: &[String], adj: &HashMap<&str, Vec<&str>>) -> bool {
    let mut white: HashSet<&str> = nodes.iter().map(|s| s.as_str()).collect();
    let mut gray: HashSet<&str> = HashSet::new();

    fn dfs<'a>(
        node: &'a str,
        adj: &HashMap<&'a str, Vec<&'a str>>,
        white: &mut HashSet<&'a str>,
        gray: &mut HashSet<&'a str>,
    ) -> bool {
        white.remove(node);
        gray.insert(node);

        if let Some(neighbors) = adj.get(node) {
            for &next in neighbors {
                if gray.contains(next) {
                    return true; // Back edge = cycle
                }
                if white.contains(next) && dfs(next, adj, white, gray) {
                    return true;
                }
            }
        }

        gray.remove(node);
        true // no cycle on this path
    }

    let nodes_copy: Vec<&str> = white.iter().copied().collect();
    for node in nodes_copy {
        if white.contains(node) && dfs(node, adj, &mut white, &mut gray) {
            return true;
        }
    }
    false
}

fn bfs_reachable<'a>(
    starts: &[&'a str],
    adj: &HashMap<&'a str, Vec<&'a str>>,
) -> HashSet<&'a str> {
    let mut visited = HashSet::new();
    let mut queue = VecDeque::new();

    for &start in starts {
        visited.insert(start);
        queue.push_back(start);
    }

    while let Some(node) = queue.pop_front() {
        if let Some(neighbors) = adj.get(node) {
            for &next in neighbors {
                if visited.insert(next) {
                    queue.push_back(next);
                }
            }
        }
    }

    visited
}
```

### 10.4 TypeScript Bindings

NAPI-RS auto-generates TypeScript declarations:

```ts
// native/index.d.ts (auto-generated by napi-rs)
export function hashFileSha256(path: string): string;
export function hashFileBlake3(path: string): string;

export interface GraphEdge {
  source: string;
  target: string;
}

export interface ValidationResult {
  isValid: boolean;
  hasCycles: boolean;
  unreachableNodes: string[];
  orphanEdges: string[];
}

export function validateWorkflowGraph(
  nodeIds: string[],
  edges: GraphEdge[]
): ValidationResult;
```

```ts
// Usage from the application
import { hashFileBlake3, validateWorkflowGraph } from 'devrig-native';

// Hash a 200MB file in ~75ms (vs ~800ms in JS)
const hash = hashFileBlake3('/path/to/large-file.bin');

// Validate a 500-node graph in ~8ms (vs ~120ms in JS)
const result = validateWorkflowGraph(nodeIds, edges);
if (!result.isValid) {
  console.warn('Graph issues:', result);
}
```

### 10.5 Build and Packaging

Native modules must be unpacked from the ASAR archive because they cannot be loaded from a virtual filesystem:

```js
// electron-builder.config.js
module.exports = {
  asar: true,
  asarUnpack: [
    // napi-rs native modules must be unpacked
    'node_modules/devrig-native/**',
    // better-sqlite3 native module
    'node_modules/better-sqlite3/**',
  ],
};
```

Build prebuilt binaries for all target platforms in CI:

```yaml
# .github/workflows/native-build.yml
name: Build Native Modules

on:
  push:
    paths: ['native/**']

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: macos-latest
            target: aarch64-apple-darwin
          - os: macos-13
            target: x86_64-apple-darwin
          - os: windows-latest
            target: x86_64-pc-windows-msvc
          - os: ubuntu-latest
            target: x86_64-unknown-linux-gnu

    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4
      - uses: actions-rust-lang/setup-rust-toolchain@v1
        with:
          target: ${{ matrix.target }}
      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Build native module
        working-directory: native
        run: |
          npm install
          npx napi build --platform --release --target ${{ matrix.target }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        with:
          name: native-${{ matrix.target }}
          path: native/*.node
```

---

## Appendix A: Quick Reference Checklist

Use this checklist before every release:

### Startup
- [ ] Cold start under 1.5s on reference hardware
- [ ] Hot start under 200ms
- [ ] V8 bytecode compilation enabled for main process
- [ ] No synchronous `require()` calls on critical path
- [ ] Window shell renders before data loads
- [ ] `Menu.setApplicationMenu(null)` called before ready event
- [ ] Tiered data loading (bootstrap -> partial -> full)
- [ ] Plugin sandboxes lazy-loaded (not during startup critical path)

### Rendering
- [ ] React Compiler enabled and all components compiling
- [ ] Virtual scrolling on all lists > 50 items
- [ ] CSS containment on all major layout sections
- [ ] Only `transform` and `opacity` animated
- [ ] `content-visibility: auto` on scrollable content items
- [ ] No layout thrashing (reads batched before writes)
- [ ] Flow builder maintains < 16ms frame time with 100+ nodes
- [ ] Unified inbox maintains 60fps with 1000+ items (TanStack Virtual)
- [ ] Plugin views lazy-loaded on selection, not on scroll
- [ ] AI badges render from cached local data (no network during scroll)

### Database
- [ ] WAL mode enabled
- [ ] `synchronous = NORMAL`
- [ ] `mmap_size = 268435456`
- [ ] `cache_size = -64000`
- [ ] All hot-path queries use indexes (verified via EXPLAIN QUERY PLAN)
- [ ] Batch writes wrapped in transactions
- [ ] Prepared statement cache active
- [ ] Inbox queries use cursor-based pagination (not OFFSET)
- [ ] Plugin sync uses transactional batch inserts

### Memory
- [ ] Idle memory under 150MB
- [ ] Active memory under 400MB
- [ ] No IPC listener leaks (ScopedIPC used)
- [ ] WeakRef used for caches
- [ ] GC hints after major state transitions
- [ ] memlab leak tests passing in CI
- [ ] Plugin isolates limited to 128MB each, pooled and recycled
- [ ] Inbox items load full body on demand (not preloaded in memory)
- [ ] AI classifications cached in SQLite, not re-computed per view

### Monitoring
- [ ] Performance marks on all critical path milestones
- [ ] CI performance tests enforce budgets (fail build on regression)
- [ ] Sentry performance monitoring active in production
- [ ] contentTracing available for startup profiling
- [ ] Memory growth rate under 10MB/hour

### Native Modules
- [ ] napi-rs modules built for all target platforms
- [ ] Native modules unpacked from ASAR
- [ ] CPU-intensive operations delegated to Rust (hashing, graph validation)

---

## Appendix B: Reference Hardware

Performance budgets are measured against the following baseline machine, representing the lower end of the target user hardware:

| Component | Specification |
|---|---|
| CPU | Intel Core i5-1235U (2022) or Apple M1 |
| RAM | 8GB |
| Storage | NVMe SSD |
| OS | macOS 14+, Windows 11, Ubuntu 22.04+ |
| Display | 60Hz |

If performance budgets are met on this hardware, they will be exceeded on more powerful machines.

---

## Appendix C: Sources and Further Reading

- [Building High-Performance Electron Apps](https://www.johnnyle.io/read/electron-performance) - Comprehensive Electron optimization guide
- [How to make your Electron app launch 1,000ms faster](https://www.devas.life/how-to-make-your-electron-app-launch-1000ms-faster/) - Startup optimization deep dive
- [6 Ways Slack, Notion, and VSCode Improved Electron App Performance](https://palette.dev/blog/improving-performance-of-electron-apps) - Production case studies
- [Electron Performance Documentation](https://www.electronjs.org/docs/latest/tutorial/performance) - Official Electron performance guide
- [Scaling the Linear Sync Engine](https://linear.app/now/scaling-the-linear-sync-engine) - Linear's sync architecture
- [Reverse Engineering Linear's Sync Magic](https://marknotfound.com/posts/reverse-engineering-linears-sync-magic/) - Technical analysis of Linear's sync protocol
- [Linear's Sync Engine Architecture](https://www.fujimon.com/blog/linear-sync-engine) - Architecture overview
- [React Compiler v1.0](https://react.dev/blog/2025/10/07/react-compiler-1) - Official React Compiler release
- [React Compiler Automatic Memoization](https://www.infoq.com/news/2025/12/react-compiler-meta/) - Production results
- [TanStack Virtual](https://tanstack.com/virtual/latest) - Virtual scrolling library
- [Motion Animation Library](https://motion.dev) - WAAPI hybrid animation engine
- [Motion Animation Performance Guide](https://motion.dev/docs/performance) - Performance optimization guide
- [The Web Animation Performance Tier List](https://motion.dev/magazine/web-animation-performance-tier-list) - Animation performance analysis
- [content-visibility: the new CSS property that boosts rendering performance](https://web.dev/articles/content-visibility) - CSS containment guide
- [better-sqlite3 Performance](https://github.com/WiseLibs/better-sqlite3/blob/master/docs/performance.md) - SQLite optimization
- [SQLite Optimizations for Ultra High-Performance](https://www.powersync.com/blog/sqlite-optimizations-for-ultra-high-performance) - Advanced SQLite tuning
- [Supercharge your Electron apps with Rust](https://blog.logrocket.com/supercharge-your-electron-apps-with-rust/) - napi-rs guide
- [Node.js Native Addons with N-API: Safely Wrapping Rust/C++](https://medium.com/@2nick2patel2/node-js-native-addons-with-n-api-safely-wrapping-rust-c-for-hot-paths-7015cbbcd7b5) - Native module patterns
- [electron-vite Source Code Protection](https://electron-vite.org/guide/source-code-protection) - V8 bytecode compilation
- [V8 Code Caching](https://v8.dev/blog/code-caching) - V8 bytecode cache internals
- [Electron contentTracing API](https://www.electronjs.org/docs/latest/api/content-tracing) - Performance profiling
- [Chrome Tracing for Fun and Profit (Slack Engineering)](https://slack.engineering/chrome-tracing-for-fun-and-profit/) - Production tracing patterns
- [Sentry for Electron](https://docs.sentry.io/platforms/javascript/guides/electron/) - Real-user monitoring
- [Electron Multithreading](https://www.electronjs.org/docs/latest/tutorial/multithreading) - Worker threads guide
- [Electron Process Model](https://www.electronjs.org/docs/latest/tutorial/process-model) - Process architecture
- [Top Strategies to Prevent Memory Leaks in Electron Apps](https://infinitejs.com/posts/top-strategies-prevent-memory-leaks-electron-apps/) - Memory management
- [Diagnosing and Fixing Memory Leaks in Electron Applications](https://www.mindfulchase.com/explore/troubleshooting-tips/frameworks-and-libraries/diagnosing-and-fixing-memory-leaks-in-electron-applications.html) - Memory leak detection
- [Debugging Electron Memory Usage](https://seenaburns.com/debugging-electron-memory-usage/) - Heap analysis techniques
- [memlab](https://www.npmjs.com/package/memlab) - Automated memory leak detection
- [Optimistic UI Patterns for Improved Perceived Performance](https://simonhearne.com/2021/optimistic-ui-patterns/) - Optimistic UI patterns
- [Building an Optimistic UI with RxDB](https://rxdb.info/articles/optimistic-ui.html) - Local-first optimistic writes
