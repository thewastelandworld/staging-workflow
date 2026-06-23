-- Staging Workflow: Supabase Schema
-- Run this in the Supabase SQL Editor

-- Teams table
CREATE TABLE IF NOT EXISTS teams (
  id          TEXT PRIMARY KEY,
  name        TEXT        NOT NULL,
  color       TEXT        NOT NULL DEFAULT '#3b82f6',
  created_at  TEXT        NOT NULL
);

-- Projects table
CREATE TABLE IF NOT EXISTS projects (
  id          TEXT PRIMARY KEY,
  name        TEXT        NOT NULL,
  description TEXT        NOT NULL DEFAULT '',
  created_at  TEXT        NOT NULL
);

-- Stages table (replaces projects.stages JSONB column)
CREATE TABLE IF NOT EXISTS stages (
  id           TEXT PRIMARY KEY,
  project_id   TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  "order"      INT  NOT NULL,
  name         TEXT NOT NULL,
  description  TEXT,
  team_id      TEXT NOT NULL REFERENCES teams(id),
  deadline     TEXT NOT NULL,
  started_at   TEXT,
  completed_at TEXT,
  status       TEXT NOT NULL DEFAULT 'pending',
  notes        TEXT,
  problem      TEXT,
  email_sent   BOOLEAN NOT NULL DEFAULT FALSE
);

-- Stage reviewers table (replaces reviewers[] inside each stage)
CREATE TABLE IF NOT EXISTS stage_reviewers (
  stage_id      TEXT NOT NULL REFERENCES stages(id) ON DELETE CASCADE,
  team_id       TEXT NOT NULL REFERENCES teams(id),
  "order"       INT  NOT NULL,
  check_content TEXT,
  checked_at    TEXT,
  note          TEXT,
  PRIMARY KEY (stage_id, team_id)
);

-- Migration: move stages JSONB to stages table (run once in Supabase SQL Editor)
--
-- Step 1: insert stages rows
--   INSERT INTO stages (id, project_id, "order", name, description, team_id, deadline,
--     started_at, completed_at, status, notes, problem, email_sent)
--   SELECT
--     s->>'id', p.id, (s->>'order')::int, s->>'name', s->>'description',
--     s->>'teamId', s->>'deadline', s->>'startedAt', s->>'completedAt',
--     COALESCE(s->>'status', 'pending'), s->>'notes', s->>'problem',
--     COALESCE((s->>'emailSent')::boolean, false)
--   FROM projects p, jsonb_array_elements(p.stages) s
--   WHERE jsonb_array_length(p.stages) > 0;
--
-- Step 2: insert stage_reviewers rows
--   INSERT INTO stage_reviewers (stage_id, team_id, "order", check_content, checked_at, note)
--   SELECT s->>'id', r->>'teamId', (r->>'order')::int,
--     r->>'checkContent', r->>'checkedAt', r->>'note'
--   FROM projects p, jsonb_array_elements(p.stages) s,
--        jsonb_array_elements(s->'reviewers') r
--   WHERE jsonb_array_length(p.stages) > 0
--     AND s->'reviewers' IS NOT NULL AND jsonb_array_length(s->'reviewers') > 0;
--
-- Step 3: after verifying data, drop the old column
--   ALTER TABLE projects DROP COLUMN stages;

-- Users table (for login authentication)
-- permission: 'admin' = 管理員, 'team_leader' = チームリーダー, 'user' = 使用者, 'readonly' = 読み取り専用
CREATE TABLE IF NOT EXISTS users (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  username      TEXT        NOT NULL UNIQUE,
  password_hash TEXT        NOT NULL,
  permission    TEXT        NOT NULL DEFAULT 'readonly' CHECK (permission IN ('admin', 'team_leader', 'user', 'readonly')),
  display_name  TEXT,
  email         TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Migration: rename role to permission in users table (run once in Supabase SQL Editor)
--
--   ALTER TABLE users RENAME COLUMN role TO permission;

-- Migration: add display_name and email to existing users table (run once in Supabase SQL Editor)
--
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Migration: add status column for admin approval workflow (run once in Supabase SQL Editor)
--
--   ALTER TABLE users ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'approved';
--   -- Existing users are already approved; new registrations will be set to 'pending' by the API.

-- Migration: add created_by to projects (run once in Supabase SQL Editor)
--
--   ALTER TABLE projects ADD COLUMN IF NOT EXISTS created_by TEXT;
--
-- This column stores the username of the user who created the project.
-- Existing projects will have NULL and will only be visible to admins.
--
-- To assign existing projects to a user, run:
--   UPDATE projects SET created_by = 'username' WHERE id = '...';

-- User-Teams junction table
CREATE TABLE IF NOT EXISTS user_teams (
  user_id  UUID NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  team_id  TEXT NOT NULL REFERENCES teams(id)  ON DELETE CASCADE,
  role     TEXT,
  PRIMARY KEY (user_id, team_id)
);

-- Migration: remove members JSONB from teams (run once in Supabase SQL Editor)
--
--   ALTER TABLE teams DROP COLUMN IF EXISTS members;
--
-- Migration: add role to user_teams (run once in Supabase SQL Editor)
--
--   ALTER TABLE user_teams ADD COLUMN IF NOT EXISTS role TEXT;

-- Migration: add problem_team_id to stages (run once in Supabase SQL Editor)
--
--   ALTER TABLE stages ADD COLUMN IF NOT EXISTS problem_team_id TEXT REFERENCES teams(id);
--
-- This column stores the team_id of the team that reported the problem.
-- Only that team (or admin) can edit/resolve the problem.

-- Disable RLS (enable and add policies if you need auth later)
ALTER TABLE teams     DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects  DISABLE ROW LEVEL SECURITY;
ALTER TABLE user_teams DISABLE ROW LEVEL SECURITY;
