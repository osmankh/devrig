-- ============================================================
-- UNIFIED INBOX (Plugin Data Aggregation)
-- ============================================================

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

-- Full-text search on inbox items
CREATE VIRTUAL TABLE IF NOT EXISTS inbox_items_fts USING fts5(
  title,
  body,
  preview,
  content='inbox_items',
  content_rowid='rowid'
);

-- Triggers to keep FTS index in sync
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

-- ============================================================
-- PLUGIN SYNC STATE
-- ============================================================

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

-- ============================================================
-- AI OPERATIONS (Unified Cost Tracking)
-- ============================================================

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
