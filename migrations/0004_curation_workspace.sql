-- Migration: 0004_curation_workspace.sql
-- Created at: 2025-10-19 21:45:00
-- Description: Adds fields to support the real-time collaborative curation workspace.

-- Add soft delete and highlighting fields to curated_knowledge
ALTER TABLE curated_knowledge ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE curated_knowledge ADD COLUMN time_inactive DATETIME;
ALTER TABLE curated_knowledge ADD COLUMN is_highlighted BOOLEAN DEFAULT FALSE;
ALTER TABLE curated_knowledge ADD COLUMN time_highlighted DATETIME;

-- Add soft delete and highlighting fields to feasibility_jobs
ALTER TABLE feasibility_jobs ADD COLUMN is_active BOOLEAN DEFAULT TRUE;
ALTER TABLE feasibility_jobs ADD COLUMN time_inactive DATETIME;
ALTER TABLE feasibility_jobs ADD COLUMN is_highlighted BOOLEAN DEFAULT FALSE;
ALTER TABLE feasibility_jobs ADD COLUMN time_highlighted DATETIME;

-- Note: KV does not have a schema, so soft deletes and highlighting
-- will be handled by adding properties to the JSON value of each entry.
-- Vectorize does not support per-entry metadata in the same way, so we will
-- manage its state by referencing IDs stored in D1.
