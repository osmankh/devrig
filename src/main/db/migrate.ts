import type { Database } from 'better-sqlite3'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'

export function runMigrations(db: Database): void {
  // Create tracking table
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      applied_at INTEGER NOT NULL
    )
  `)

  const migrationsDir = join(__dirname, 'migrations')

  let files: string[]
  try {
    files = readdirSync(migrationsDir)
      .filter((f) => f.endsWith('.sql'))
      .sort()
  } catch {
    // No migrations directory in production - migrations are bundled inline
    files = []
  }

  if (files.length === 0) {
    // Inline fallback: run migrations directly when files aren't available
    runInlineMigrations(db)
    return
  }

  const applyMigration = db.transaction(
    (name: string, sql: string) => {
      db.exec(sql)
      db.prepare(
        'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)'
      ).run(name, Date.now())
    }
  )

  for (const file of files) {
    const applied = db
      .prepare('SELECT name FROM _migrations WHERE name = ?')
      .get(file) as { name: string } | undefined

    if (!applied) {
      const sql = readFileSync(join(migrationsDir, file), 'utf-8')
      applyMigration(file, sql)
    }
  }
}

function runInlineMigrations(db: Database): void {
  const migrations: Array<{ name: string; sql: string }> = [
    {
      name: '0001_initial.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS workspaces (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          settings TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS workflows (
          id TEXT PRIMARY KEY,
          workspace_id TEXT NOT NULL REFERENCES workspaces(id),
          name TEXT NOT NULL,
          description TEXT DEFAULT '',
          status TEXT NOT NULL DEFAULT 'draft',
          trigger_config TEXT DEFAULT '{}',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS flow_nodes (
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
        CREATE TABLE IF NOT EXISTS flow_edges (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
          source_node_id TEXT NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
          target_node_id TEXT NOT NULL REFERENCES flow_nodes(id) ON DELETE CASCADE,
          source_handle TEXT,
          target_handle TEXT,
          label TEXT DEFAULT '',
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS executions (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL REFERENCES workflows(id),
          status TEXT NOT NULL DEFAULT 'pending',
          trigger_type TEXT NOT NULL,
          started_at INTEGER,
          completed_at INTEGER,
          error TEXT,
          created_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS execution_steps (
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
        CREATE TABLE IF NOT EXISTS secrets (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          encrypted_value TEXT NOT NULL,
          provider TEXT NOT NULL DEFAULT 'safeStorage',
          created_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS plugins (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          version TEXT NOT NULL,
          manifest TEXT NOT NULL,
          enabled INTEGER NOT NULL DEFAULT 1,
          installed_at INTEGER NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_workflows_workspace ON workflows(workspace_id, updated_at DESC);
        CREATE INDEX IF NOT EXISTS idx_flow_nodes_workflow ON flow_nodes(workflow_id);
        CREATE INDEX IF NOT EXISTS idx_flow_edges_source ON flow_edges(source_node_id);
        CREATE INDEX IF NOT EXISTS idx_flow_edges_target ON flow_edges(target_node_id);
        CREATE INDEX IF NOT EXISTS idx_executions_workflow ON executions(workflow_id, started_at DESC);
        CREATE INDEX IF NOT EXISTS idx_execution_steps_execution ON execution_steps(execution_id);
      `
    },
    {
      name: '0002_inbox_and_ai.sql',
      sql: `
        CREATE TABLE IF NOT EXISTS inbox_items (
          id                TEXT PRIMARY KEY,
          plugin_id         TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
          external_id       TEXT NOT NULL,
          type              TEXT NOT NULL,
          title             TEXT NOT NULL,
          body              TEXT,
          preview           TEXT,
          source_url        TEXT,
          priority          INTEGER NOT NULL DEFAULT 0,
          status            TEXT NOT NULL DEFAULT 'unread',
          ai_classification TEXT,
          ai_summary        TEXT,
          ai_draft          TEXT,
          metadata          TEXT DEFAULT '{}',
          is_actionable     INTEGER NOT NULL DEFAULT 0,
          snoozed_until     INTEGER,
          external_created_at INTEGER,
          synced_at         INTEGER NOT NULL,
          created_at        INTEGER NOT NULL,
          updated_at        INTEGER NOT NULL,
          UNIQUE(plugin_id, external_id)
        );
        CREATE INDEX IF NOT EXISTS idx_inbox_items_plugin ON inbox_items(plugin_id, status);
        CREATE INDEX IF NOT EXISTS idx_inbox_items_status ON inbox_items(status, priority DESC, updated_at DESC);
        CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_items_external ON inbox_items(plugin_id, external_id);
        CREATE INDEX IF NOT EXISTS idx_inbox_items_snoozed ON inbox_items(snoozed_until) WHERE snoozed_until IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_inbox_items_actionable ON inbox_items(is_actionable) WHERE is_actionable = 1;
        CREATE INDEX IF NOT EXISTS idx_inbox_items_type ON inbox_items(plugin_id, type);

        CREATE VIRTUAL TABLE IF NOT EXISTS inbox_items_fts USING fts5(
          title,
          body,
          preview,
          content='inbox_items',
          content_rowid='rowid'
        );

        CREATE TRIGGER IF NOT EXISTS inbox_items_ai AFTER INSERT ON inbox_items BEGIN
          INSERT INTO inbox_items_fts(rowid, title, body, preview)
          VALUES (NEW.rowid, NEW.title, NEW.body, NEW.preview);
        END;
        CREATE TRIGGER IF NOT EXISTS inbox_items_ad AFTER DELETE ON inbox_items BEGIN
          INSERT INTO inbox_items_fts(inbox_items_fts, rowid, title, body, preview)
          VALUES ('delete', OLD.rowid, OLD.title, OLD.body, OLD.preview);
        END;
        CREATE TRIGGER IF NOT EXISTS inbox_items_au AFTER UPDATE ON inbox_items BEGIN
          INSERT INTO inbox_items_fts(inbox_items_fts, rowid, title, body, preview)
          VALUES ('delete', OLD.rowid, OLD.title, OLD.body, OLD.preview);
          INSERT INTO inbox_items_fts(rowid, title, body, preview)
          VALUES (NEW.rowid, NEW.title, NEW.body, NEW.preview);
        END;

        CREATE TABLE IF NOT EXISTS plugin_sync_state (
          plugin_id         TEXT NOT NULL REFERENCES plugins(id) ON DELETE CASCADE,
          data_source_id    TEXT NOT NULL,
          last_sync_at      INTEGER,
          sync_cursor       TEXT,
          sync_status       TEXT NOT NULL DEFAULT 'idle',
          error             TEXT,
          items_synced      INTEGER NOT NULL DEFAULT 0,
          created_at        INTEGER NOT NULL,
          updated_at        INTEGER NOT NULL,
          PRIMARY KEY (plugin_id, data_source_id)
        );
        CREATE INDEX IF NOT EXISTS idx_pss_status ON plugin_sync_state(sync_status);
        CREATE INDEX IF NOT EXISTS idx_pss_plugin ON plugin_sync_state(plugin_id);

        CREATE TABLE IF NOT EXISTS ai_operations (
          id                TEXT PRIMARY KEY,
          provider          TEXT NOT NULL,
          model             TEXT NOT NULL,
          operation         TEXT NOT NULL,
          plugin_id         TEXT REFERENCES plugins(id) ON DELETE SET NULL,
          pipeline_id       TEXT,
          inbox_item_id     TEXT REFERENCES inbox_items(id) ON DELETE SET NULL,
          execution_id      TEXT REFERENCES executions(id) ON DELETE SET NULL,
          input_tokens      INTEGER NOT NULL DEFAULT 0,
          output_tokens     INTEGER NOT NULL DEFAULT 0,
          cost_usd          REAL NOT NULL DEFAULT 0.0,
          duration_ms       INTEGER,
          created_at        INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_ai_ops_provider ON ai_operations(provider, created_at);
        CREATE INDEX IF NOT EXISTS idx_ai_ops_plugin ON ai_operations(plugin_id, created_at);
        CREATE INDEX IF NOT EXISTS idx_ai_ops_created ON ai_operations(created_at);
      `
    }
  ]

  const applyInline = db.transaction((name: string, sql: string) => {
    db.exec(sql)
    db.prepare(
      'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)'
    ).run(name, Date.now())
  })

  for (const migration of migrations) {
    const applied = db
      .prepare('SELECT name FROM _migrations WHERE name = ?')
      .get(migration.name) as { name: string } | undefined

    if (!applied) {
      applyInline(migration.name, migration.sql)
    }
  }
}
