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
    // Inline fallback: run initial migration directly when files aren't available
    const applied = db
      .prepare('SELECT name FROM _migrations WHERE name = ?')
      .get('0001_initial.sql') as { name: string } | undefined

    if (!applied) {
      runInlineMigration(db)
    }
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

function runInlineMigration(db: Database): void {
  const sql = `
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

  const apply = db.transaction(() => {
    db.exec(sql)
    db.prepare(
      'INSERT INTO _migrations (name, applied_at) VALUES (?, ?)'
    ).run('0001_initial.sql', Date.now())
  })

  apply()
}
