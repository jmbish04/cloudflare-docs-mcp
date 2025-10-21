-- Migration: 0002_feasibility_agent.sql
-- Created at: 2025-10-19 20:50:00
-- Description: Adds tables to support the proactive Feasibility Agent.

-- Drop tables if they exist for clean migrations.
DROP TABLE IF EXISTS feasibility_jobs;
DROP TABLE IF EXISTS repository_analysis;

-- Table: feasibility_jobs
-- Description: Tracks the state of a long-running, proactive research request.
CREATE TABLE feasibility_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uuid TEXT NOT NULL UNIQUE,
    status TEXT NOT NULL CHECK(status IN ('QUEUED', 'IN_PROGRESS', 'COMPLETED', 'FAILED')) DEFAULT 'QUEUED',
    request_prompt TEXT NOT NULL,
    final_report TEXT, -- The final synthesized report
    created_at DATETIME DEFAULT (datetime('now')),
    updated_at DATETIME DEFAULT (datetime('now'))
);

-- Table: repository_analysis
-- Description: Stores the detailed AI analysis for each GitHub repository
-- scanned as part of a feasibility job.
CREATE TABLE repository_analysis (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id INTEGER NOT NULL,
    repo_url TEXT NOT NULL,
    analysis_summary TEXT NOT NULL, -- AI-generated summary of the repo's relevance
    frameworks_detected TEXT, -- Comma-separated list of detected frameworks
    is_on_workers BOOLEAN,
    raw_analysis_data TEXT, -- Full JSON response from the AI analysis
    created_at DATETIME DEFAULT (datetime('now')),
    FOREIGN KEY (job_id) REFERENCES feasibility_jobs (id)
);

CREATE INDEX idx_feasibility_jobs_uuid ON feasibility_jobs (uuid);
CREATE INDEX idx_repository_analysis_job_id ON repository_analysis (job_id);
