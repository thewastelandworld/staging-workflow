-- Staging Workflow: Supabase Schema
-- Run this in the Supabase SQL Editor

-- Teams table
-- members are stored as JSONB: [{ id, name, email, role }]
CREATE TABLE IF NOT EXISTS teams (
  id          TEXT PRIMARY KEY,
  name        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#3b82f6',
  created_at  TEXT        NOT NULL,
  members     JSONB       NOT NULL DEFAULT '[]'::jsonb
);

-- Projects table
-- stages are stored as JSONB: [{ id, projectId, order, name, description,
--   teamId, deadline, startedAt, completedAt, status, notes, problem,
--   emailSent, reviewers: [{ teamId, order, checkContent, checkedAt, note }] }]
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  created_at  TEXT        NOT NULL,
  stages      JSONB       NOT NULL DEFAULT '[]'::jsonb
);

-- Disable RLS (enable and add policies if you need auth later)
ALTER TABLE teams   DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
