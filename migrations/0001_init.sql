-- Base schema for the documentation search corpus.
-- All statements are idempotent to keep repeated deployments safe.

PRAGMA foreign_keys = ON;

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
