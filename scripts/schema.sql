-- AgentOS Postgres schema (Neon / Vercel Postgres).
-- Mirrors SQL_SCHEMA exported from @agentos-sui/sdk/node's storage/sql-store.ts —
-- keep the two in sync if you change one.
--
-- Run this once against your Neon database before setting STORAGE_BACKEND=postgres:
--   psql "$DATABASE_URL" -f scripts/schema.sql
-- or paste it into the Neon SQL Editor (console.neon.tech).

CREATE TABLE IF NOT EXISTS agents (
  slug              TEXT PRIMARY KEY,
  suins_name        TEXT NOT NULL UNIQUE,
  passport_id       TEXT NOT NULL,
  runtime_wallet    TEXT NOT NULL,
  network           TEXT NOT NULL DEFAULT 'testnet',
  passport_version  TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'active',
  created_at        TEXT NOT NULL,
  description       TEXT,
  memory_namespaces TEXT NOT NULL DEFAULT '[]',
  delegations       TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE IF NOT EXISTS skills (
  agent_slug            TEXT NOT NULL,
  skill_id              TEXT NOT NULL,
  name                  TEXT NOT NULL,
  mvr_package           TEXT NOT NULL,
  version               TEXT NOT NULL,
  walrus_manifest_blob  TEXT NOT NULL,
  manifest_hash         TEXT NOT NULL,
  end_epoch             INTEGER,
  object_id             TEXT NOT NULL,
  suins_name            TEXT,
  seal_policy_id        TEXT,
  network               TEXT NOT NULL,
  status                TEXT NOT NULL DEFAULT 'active',
  resolutions           TEXT NOT NULL DEFAULT '0',
  last_updated          TEXT NOT NULL,
  icon                  TEXT NOT NULL DEFAULT 'token',
  source                TEXT,
  dependencies          TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (agent_slug, skill_id),
  FOREIGN KEY (agent_slug) REFERENCES agents(slug) ON DELETE CASCADE
);

-- Delegations are stored inline on agents.delegations (a JSON array) to match
-- the RegistryFile shape the pure logic mutates. This normalized table is an
-- OPTIONAL alternative for queryability; the reference stores do NOT use it.
CREATE TABLE IF NOT EXISTS delegations (
  agent_slug           TEXT NOT NULL,
  child_agent          TEXT NOT NULL,
  child_name           TEXT NOT NULL,
  allowed_skills       TEXT NOT NULL DEFAULT '[]',
  allowed_capabilities TEXT NOT NULL DEFAULT '[]',
  spend_limit          TEXT NOT NULL,
  spent                TEXT NOT NULL,
  expiry_ms            TEXT NOT NULL,
  revoked              INTEGER NOT NULL DEFAULT 0,
  cap_id               TEXT,
  created_at           TEXT NOT NULL,
  FOREIGN KEY (agent_slug) REFERENCES agents(slug) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS runs (
  run_id     TEXT PRIMARY KEY,
  agent_slug TEXT NOT NULL,
  status     TEXT NOT NULL,
  steps      TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_agent_created
  ON runs (agent_slug, created_at DESC);

CREATE TABLE IF NOT EXISTS workflows (
  slug                 TEXT PRIMARY KEY,
  agent_slug           TEXT NOT NULL,
  workflow_id          TEXT NOT NULL,
  name                 TEXT NOT NULL,
  suins_name           TEXT NOT NULL,
  version              TEXT NOT NULL,
  walrus_manifest_blob TEXT NOT NULL DEFAULT '',
  manifest_hash        TEXT NOT NULL DEFAULT '',
  end_epoch            INTEGER,
  network              TEXT NOT NULL DEFAULT 'testnet',
  status               TEXT NOT NULL DEFAULT 'draft',
  description          TEXT,
  dependencies         TEXT NOT NULL DEFAULT '[]',
  created_at           TEXT NOT NULL,
  last_updated         TEXT NOT NULL,
  FOREIGN KEY (agent_slug) REFERENCES agents(slug) ON DELETE CASCADE
);
