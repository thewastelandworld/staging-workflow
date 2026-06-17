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

-- Users table (for login authentication)
-- role: 'admin' = 管理員, 'user' = 使用者, 'readonly' = 読み取り専用
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  role          TEXT        NOT NULL DEFAULT 'readonly' CHECK (role IN ('admin', 'user', 'readonly')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration: if the users table already exists with the old constraint (admin, readonly only),
-- run the following to add 'user' as a valid role:
--
--   ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
--   ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('admin', 'user', 'readonly'));

-- Disable RLS (enable and add policies if you need auth later)
ALTER TABLE teams   DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
