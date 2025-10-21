PRAGMA foreign_keys = ON;

-- Documentation corpus tables
CREATE TABLE IF NOT EXISTS docs (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  snippet TEXT NOT NULL,
  content TEXT NOT NULL,
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_docs_product ON docs(product);

CREATE VIRTUAL TABLE IF NOT EXISTS docs_fts USING fts5(
  id UNINDEXED,
  title,
  content,
  snippet,
  tokenize = 'porter'
);

CREATE TRIGGER IF NOT EXISTS docs_ai AFTER INSERT ON docs BEGIN
  INSERT INTO docs_fts (rowid, id, title, content, snippet)
  VALUES (new.rowid, new.id, new.title, new.content, new.snippet);
END;

CREATE TRIGGER IF NOT EXISTS docs_ad AFTER DELETE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, id, title, content, snippet)
  VALUES('delete', old.rowid, old.id, old.title, old.content, old.snippet);
END;

CREATE TRIGGER IF NOT EXISTS docs_au AFTER UPDATE ON docs BEGIN
  INSERT INTO docs_fts(docs_fts, rowid, id, title, content, snippet)
  VALUES('delete', old.rowid, old.id, old.title, old.content, old.snippet);
  INSERT INTO docs_fts(rowid, id, title, content, snippet)
  VALUES(new.rowid, new.id, new.title, new.content, new.snippet);
END;

-- Transactions and curated knowledge
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  timestamp DATETIME DEFAULT (datetime('now')),
  event_type TEXT NOT NULL CHECK(event_type IN ('USER_QUERY', 'VECTOR_SEARCH', 'D1_QUERY', 'LIVE_DOCS_QUERY', 'KV_READ', 'KV_WRITE', 'SANDBOX_EXECUTION', 'FINAL_RESPONSE')),
  event_data TEXT,
  status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'ERROR', 'PENDING')),
  error_message TEXT,
  duration_ms INTEGER
);

CREATE TABLE IF NOT EXISTS curated_knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  source_url TEXT,
  tags TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  is_active BOOLEAN DEFAULT TRUE,
  time_inactive DATETIME,
  is_highlighted BOOLEAN DEFAULT FALSE,
  time_highlighted DATETIME
);

CREATE INDEX IF NOT EXISTS idx_transactions_session_id ON transactions (session_id);
CREATE INDEX IF NOT EXISTS idx_transactions_event_type ON transactions (event_type);
CREATE INDEX IF NOT EXISTS idx_curated_knowledge_tags ON curated_knowledge (tags);

-- Feasibility research domain tables
CREATE TABLE IF NOT EXISTS feasibility_jobs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK(status IN ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED')) DEFAULT 'QUEUED',
  request_prompt TEXT NOT NULL,
  final_report TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  updated_at DATETIME DEFAULT (datetime('now')),
  is_active BOOLEAN DEFAULT TRUE,
  time_inactive DATETIME,
  is_highlighted BOOLEAN DEFAULT FALSE,
  time_highlighted DATETIME,
  information_packet_id INTEGER
);

CREATE TABLE IF NOT EXISTS repository_analysis (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL,
  repo_url TEXT NOT NULL,
  analysis_summary TEXT NOT NULL,
  frameworks_detected TEXT,
  is_on_workers BOOLEAN,
  raw_analysis_data TEXT,
  created_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES feasibility_jobs (id)
);

CREATE INDEX IF NOT EXISTS idx_feasibility_jobs_uuid ON feasibility_jobs (uuid);
CREATE INDEX IF NOT EXISTS idx_repository_analysis_job_id ON repository_analysis (job_id);

CREATE TABLE IF NOT EXISTS information_packets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_id INTEGER NOT NULL UNIQUE,
  content TEXT NOT NULL,
  version INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (job_id) REFERENCES feasibility_jobs (id)
);

CREATE TABLE IF NOT EXISTS packet_highlights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  packet_id INTEGER NOT NULL,
  section_identifier TEXT NOT NULL,
  user_comment TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at DATETIME DEFAULT (datetime('now')),
  FOREIGN KEY (packet_id) REFERENCES information_packets (id)
);

CREATE INDEX IF NOT EXISTS idx_packet_highlights_packet_id ON packet_highlights (packet_id);

-- Health checks
CREATE TABLE IF NOT EXISTS health_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp DATETIME DEFAULT (datetime('now')),
  overall_status TEXT NOT NULL CHECK(overall_status IN ('PASS', 'FAIL')),
  results_data TEXT NOT NULL
);
