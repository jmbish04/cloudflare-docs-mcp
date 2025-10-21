-- Migration: 0003_health_checks.sql
-- Created at: 2025-10-19 21:00:00
-- Description: Adds a table to store the results of comprehensive health checks.

-- Drop table if it exists for clean migrations.
DROP TABLE IF EXISTS health_checks;

-- Table: health_checks
-- Description: Stores the results of on-demand or scheduled system health checks.
CREATE TABLE health_checks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT (datetime('now')),
    overall_status TEXT NOT NULL CHECK(overall_status IN ('PASS', 'FAIL')),
    -- A JSON array of detailed results for each component check.
    -- Example: [{"component": "D1", "status": "PASS"}, {"component": "KV", "status": "FAIL", "error": "..."}]
    results_data TEXT NOT NULL
);
