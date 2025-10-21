-- Migration: 0001_initial_schema.sql
-- Created at: 2025-10-19 20:30:00
-- Description: Sets up the initial tables for transaction logging and curated knowledge.

-- Drop tables if they exist to ensure a clean slate on fresh migrations.
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS curated_knowledge;

-- Table: transactions
-- Description: Logs every significant action taken by the agent during a session.
-- This provides a complete audit trail for debugging, observability, and future analysis.
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp DATETIME DEFAULT (datetime('now')),
    event_type TEXT NOT NULL CHECK(event_type IN ('USER_QUERY', 'VECTOR_SEARCH', 'D1_QUERY', 'LIVE_DOCS_QUERY', 'KV_READ', 'KV_WRITE', 'SANDBOX_EXECUTION', 'FINAL_RESPONSE')),
    event_data TEXT, -- JSON blob containing context-specific data for the event
    status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'ERROR', 'PENDING')),
    error_message TEXT,
    duration_ms INTEGER
);

-- Table: curated_knowledge
-- Description: Stores our curated best practices, gotchas, and standardized code guidelines
-- that supplement the official Cloudflare documentation.
CREATE TABLE curated_knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    source_url TEXT, -- Optional URL to the source of the information (e.g., blog post, GitHub Gist)
    tags TEXT, -- Comma-separated list of tags for easy searching
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);

-- Create indexes for faster lookups
CREATE INDEX idx_transactions_session_id ON transactions (session_id);
CREATE INDEX idx_transactions_event_type ON transactions (event_type);
CREATE INDEX idx_curated_knowledge_tags ON curated_knowledge (tags);

