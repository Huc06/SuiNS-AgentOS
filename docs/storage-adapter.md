# Storage adapter — pluggable, durable registry & runs persistence

How the deployed app (`packages/frontend`) persists agents, skills, delegations,
and workflow runs — and how to swap the default file backend for a real database
(Vercel Postgres, Cloudflare D1, Turso/libSQL) **without touching any route
code**. Cross-references [`cloudflare-deploy-plan.md`](./cloudflare-deploy-plan.md)
(the Workers/D1 deploy plan this adapter unblocks).

> Scope: this is the **frontend's** persistence layer. The **CLI and MCP** server
> keep using the synchronous `LocalRegistry` (local `.agentos/registry.json`) and
> are intentionally NOT changed. That is a documented fork — see
> [The CLI/MCP fork](#the-climcp-fork) below.

---

## 1. The bug this fixed

The app persisted to the **filesystem** and **silently lost writes**:

1. **`appendRun` read-modify-write data-loss race.** The old frontend
   `lib/runs-store.ts` appended a workflow run by doing a whole-file
   `load → push → save`. Two concurrent runs each read the same `N` records,
   each pushed one, each wrote `N+1` — so one record was lost. A reproduction
   dropped **49 of 50** records under concurrency.
2. **Non-atomic registry writes.** `LocalRegistry` (wrapped by
   `lib/registry-server.ts`) wrote `.agentos/registry.json` synchronously and
   non-atomically, so a crash or concurrent write could leave a half-written,
   corrupt JSON file.
3. **Ephemeral on serverless.** On Vercel (`/tmp`) and Cloudflare Workers
   (`node:fs` is per-request ephemeral — see the CF changelog cited in the
   deploy plan §3) those writes do not survive across requests at all.

The fix: a **platform-neutral, async, pluggable storage abstraction**. Writes are
now atomic and race-free on the file backend, and a real DB can slot in later.

---

## 2. The interfaces — `RegistryStore` & `RunsStore`

Defined in `packages/sdk/src/storage/types.ts`, exported from `@agentos/sdk/node`.
**Route code depends ONLY on these interfaces**, so any backend that implements
them drops in with no route changes. Every method is `Promise`-returning.

```ts
interface RegistryStore {
  // reads
  getAgents(): Promise<RegistryAgentRecord[]>;
  getSkills(): Promise<RegistrySkillRecord[]>;
  listAgents(): Promise<RegistryAgentRecord[]>;            // active only
  resolveAgent(name): Promise<ResolveAgentResponse | null>; // *.sui | @slug | slug
  findAgentBySuins(suinsName): Promise<RegistryAgentRecord | undefined>;
  listSkills(agentName): Promise<RegistrySkillRecord[]>;
  searchAgents(query, limit?): Promise<RegistryAgentRecord[]>; // prefix>substring>subsequence
  listMemoryNamespaces(agentName): Promise<string[]>;
  listDelegations(agentName): Promise<DelegationRecord[]>;
  // writes
  registerAgent(input): Promise<RegistryAgentRecord>;      // throws on dup/invalid name
  removeAgent(name): Promise<RegistryAgentRecord>;          // cascade to skills
  publishSkill(input): Promise<RegistrySkillRecord>;        // upsert under an agent
  recordMemoryNamespace(agentName, namespace): Promise<string[]>; // deduped, recent-first
  addDelegation(agentName, delegation): Promise<void>;
}

interface RunsStore {
  appendRun(run): Promise<WorkflowRunRecord>;   // concurrency-safe: never loses records
  listRuns(agentSlug): Promise<WorkflowRunRecord[]>; // newest first
  getRun(runId): Promise<WorkflowRunRecord | undefined>;
}
```

Record shapes (`RegistryAgentRecord`, `RegistrySkillRecord`, `DelegationRecord`,
`WorkflowRunRecord`) come from the same module — import them from
`@agentos/sdk/node` when writing a backend.

### Single source of truth for the *logic*

All normalization (`normalizeSuinsName`/`slugFromSuins`), search scoring,
namespace dedupe, dup/validation guards, and the remove-cascade live in **one**
pure module: `packages/sdk/src/registry/registry-logic.ts`. The sync
`LocalRegistry` and **every** async store call into it, so backends **cannot
diverge** in behavior — they differ only in *where bytes land*.

---

## 3. The backends

| Backend | Impl (`@agentos/sdk/node`) | Durability | When |
| --- | --- | --- | --- |
| **file** (default) | `FileRegistryStore`, `FileRunsStore` | Atomic temp-file + `fs.rename` for the registry; **one file per run** in `runs.d/` for runs | Local dev only. **NOT safe on Vercel** — `/tmp` is per-instance, so concurrent requests can land on different instances with no shared filesystem, and any instance can cold-start and reset to the bundled seed at any time. Observed real bug: publishing a workflow then refreshing (or navigating away and back) can show a stale/reseeded workflow, because the read landed on an instance that never saw the write. |
| **memory** | `InMemoryRegistryStore`, `InMemoryRunsStore` | Ephemeral (process lifetime) | Tests; read-only serverless fs with no writable `/tmp`. Same per-instance problem as `file`, plus it doesn't even persist across a cold start. |
| **postgres** | `SqlRegistryStore`, `SqlRunsStore` via `createPostgresStores` (wired in `lib/db.ts`) | Durable, multi-instance, read-after-write | **Production on Vercel.** Real shared state — every instance reads/writes the same database, so the `/tmp` data-loss class of bug is structurally impossible. Set `DATABASE_URL` + `STORAGE_BACKEND=postgres`; run `scripts/schema.sql` once. |
| **d1** | `SqlRegistryStore`/`SqlRunsStore` via `createD1Stores` | Durable, multi-instance | You wire it (see §6A) — needed only for a Cloudflare Workers deploy, not Vercel. |

Why the file backend is now safe:

- **Atomic registry writes** — `atomicWrite` writes a temp file then `rename`s it
  over the target (`rename` is atomic on POSIX), so a partial/concurrent write
  can never corrupt the JSON. A per-absolute-path `AsyncLock` re-loads the
  freshest document *inside* the lock before each mutation, so concurrent
  `registerAgent`/`publishSkill` calls never clobber each other.
- **Append-safe runs** — `appendRun` writes **one file per run** into `runs.d/`
  (an independent atomic create), so there is nothing to read-modify-write and
  nothing to lose. Listing reads every `*.json` in the dir (plus the legacy
  single `runs.json` for back-compat). This is the structural fix for bug #1.

### The `STORAGE_BACKEND` env

The frontend selects a backend at runtime via `STORAGE_BACKEND`
(`packages/frontend/lib/registry-server.ts` + `lib/runs-store.ts`):

| Value | Effect |
| --- | --- |
| _(unset)_ / `file` | File-backed stores. **Not safe on Vercel** (see the table above) — use only for local dev. |
| `memory` | In-memory stores (ephemeral; for a read-only serverless fs, e.g. Cloudflare Workers without D1). |
| `postgres` | **Wired and production-ready.** Neon/Vercel Postgres via `lib/db.ts`. Requires `DATABASE_URL`. |
| `d1` | **You add this** — one `case` that builds a `SqlRegistryStore`/`SqlRunsStore` via `createD1Stores` (see §6A). Only needed for a Cloudflare Workers deploy. |

Path resolution (`AGENTOS_REGISTRY_PATH` / `AGENTOS_RUNS_PATH` env overrides and
the Vercel `/tmp` seed-copy) lives in `packages/sdk/src/storage/factory.ts`
(`createDefaultRegistryStore`/`createDefaultRunsStore`), not in the routes.

---

## 4. The DB-adapter contract — `SqlDatabase`

A real DB plugs in through **one thin, injected interface**, in
`packages/sdk/src/storage/sql-store.ts`. It is a **sketch**: it type-checks and
encodes the full row mapping + SQL, but opens **no connection**, reads **no
credentials**, and bundles **no driver**. You provide the query function.

```ts
interface SqlDatabase {
  // Run a parameterized statement. Placeholders are positional `?`.
  // Implementors MUST use real bound params — never interpolate into SQL.
  query(sql: string, params?: readonly unknown[]): Promise<{ rows: SqlRow[] }>;
  // Optional: run fn in a transaction (commit on resolve, roll back on throw).
  // Multi-row mutations (removeAgent's cascade) want this; single-statement
  // paths are fine without it.
  transaction?<T>(fn: (tx: SqlDatabase) => Promise<T>): Promise<T>;
}
```

- `SqlRegistryStore` loads the agent/skill rows into an in-memory `RegistryFile`,
  runs the **shared pure logic**, then writes the result back inside a
  `transaction` — so it cannot diverge from the file/memory backends, and the
  DB's own MVCC/locking replaces the file store's `AsyncLock`.
- `SqlRunsStore` maps 1:1 to rows: `appendRun` is a **single `INSERT`** (the
  data-loss race is structurally gone), `listRuns`/`getRun` are indexed
  `SELECT`s. `listRuns` uses `ORDER BY created_at DESC` — the
  `(agent_slug, created_at DESC)` index preserves the file/memory backends'
  `localeCompare(createdAt)` newest-first order.

The sketch emits `?` placeholders (D1 / libSQL / SQLite style). `createPostgresStores`
rewrites `?` → `$n` for Postgres; `createD1Stores` keeps `?` (D1 native).

---

## 5. The SQL schema

Exported verbatim as `SQL_SCHEMA` from `@agentos/sdk/node` and reproduced here.
Portable across SQLite/D1 and Postgres (on Postgres you may switch the JSON-ish
`TEXT` columns — `memory_namespaces`, `dependencies`, `steps` — to `JSONB`). Run
it once at provisioning time.

```sql
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
  memory_namespaces TEXT NOT NULL DEFAULT '[]',   -- JSON array
  delegations       TEXT NOT NULL DEFAULT '[]'    -- JSON array (inline, matches RegistryFile)
);

CREATE TABLE IF NOT EXISTS skills (
  agent_slug           TEXT NOT NULL,
  skill_id             TEXT NOT NULL,
  name                 TEXT NOT NULL,
  mvr_package          TEXT NOT NULL,
  version              TEXT NOT NULL,
  walrus_manifest_blob TEXT NOT NULL,
  manifest_hash        TEXT NOT NULL,
  object_id            TEXT NOT NULL,
  suins_name           TEXT,
  seal_policy_id       TEXT,
  network              TEXT NOT NULL,
  status               TEXT NOT NULL DEFAULT 'active',
  resolutions          TEXT NOT NULL DEFAULT '0',
  last_updated         TEXT NOT NULL,
  icon                 TEXT NOT NULL DEFAULT 'token',
  source               TEXT,
  dependencies         TEXT NOT NULL DEFAULT '[]', -- JSON array
  PRIMARY KEY (agent_slug, skill_id),
  FOREIGN KEY (agent_slug) REFERENCES agents(slug) ON DELETE CASCADE
);

-- Delegations are stored inline on agents.delegations (a JSON array) to match the
-- RegistryFile shape the pure logic mutates. This normalized table is an OPTIONAL
-- alternative for queryability; the reference stores do NOT use it.
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
  steps      TEXT NOT NULL,                        -- JSON array of StepResult
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_runs_agent_created
  ON runs (agent_slug, created_at DESC);
```

---

## 6. Plug in a real DB — step by step

Provisioning a database and creating credentials is a **USER action**. The code
side is small: build a `SqlDatabase`, then add a `STORAGE_BACKEND` case.

### A. Cloudflare D1

1. **(USER)** Create the DB and apply the schema:
   ```bash
   wrangler d1 create agentos
   # paste the printed database_id into wrangler.jsonc (see cloudflare-deploy-plan.md §5)
   wrangler d1 execute agentos --file=./schema.sql   # schema.sql = SQL_SCHEMA above
   ```
2. **(USER)** Add the binding in `wrangler.jsonc`:
   ```jsonc
   "d1_databases": [
     { "binding": "AGENTOS_DB", "database_name": "agentos", "database_id": "<id>" }
   ]
   ```
3. **(CODE)** In `lib/registry-server.ts` / `lib/runs-store.ts`, add a `d1` case:
   ```ts
   import { createD1Stores } from "@agentos/sdk/node";
   import { getCloudflareContext } from "@opennextjs/cloudflare";
   // ...
   if (backend === "d1") {
     const { registry, runs } = createD1Stores(getCloudflareContext().env.AGENTOS_DB);
     // cache + return registry (registry-server) / runs (runs-store)
   }
   ```
4. **(USER)** Set `STORAGE_BACKEND=d1` and seed once from the existing file:
   `wrangler d1 execute agentos --file=seed.sql` (translate `.agentos/registry.json`).

> D1 has no interactive `BEGIN/COMMIT`; for the multi-row `removeAgent` cascade,
> rely on the FK `ON DELETE CASCADE` in the schema (or batch via `d1.batch([...])`).
> See the `createD1Stores` TODO in `sql-store.ts`.

### B. Vercel Postgres / Neon (wired — this is what the deployed app uses)

`@vercel/postgres` is deprecated (Vercel transitioned all Postgres storage to
Neon's native integration in Q4 2024–Q1 2025); this uses
[`@neondatabase/serverless`](https://neon.tech/docs/serverless/serverless-driver)
directly, per Neon's own recommendation for serverless environments.

1. **(USER)** Provision a database:
   - Via Vercel: **Storage tab → Create Database → Neon (Serverless Postgres)**.
     This sets `DATABASE_URL` in your project's env automatically.
   - Or directly via [console.neon.tech](https://console.neon.tech): create a
     project, copy the connection string from **Connection Details**.
2. **(USER)** Apply the schema once:
   ```bash
   psql "$DATABASE_URL" -f scripts/schema.sql
   # or paste scripts/schema.sql into the Neon SQL Editor
   ```
3. **(USER, optional)** Migrate existing `.agentos/registry.json` data:
   ```bash
   cd packages/frontend
   DATABASE_URL="..." npx tsx ../../scripts/migrate-to-postgres.ts
   ```
   Safe to re-run — every write is an upsert.
4. **(USER)** Set env and deploy:
   ```
   DATABASE_URL=postgresql://...
   STORAGE_BACKEND=postgres
   ```

The wiring (already in the codebase, no further code changes needed):
- `packages/frontend/lib/db.ts` — `getPostgresStores()`, a cached
  `{ registry, runs }` pair built from `neon(DATABASE_URL)` passed to
  `createPostgresStores`.
- `lib/registry-server.ts` / `lib/runs-store.ts` — `STORAGE_BACKEND=postgres`
  routes to `getPostgresStores()` instead of the file/memory factory.
- `app/api/workflows/[slug]/run/route.ts`'s `resolve` bundle also falls back to
  the SAME async `RegistryStore` (whatever `STORAGE_BACKEND` resolves to)
  instead of `AgentOSClient`'s own internal file-based `LocalRegistry` — that
  internal registry always reads the local `.agentos/registry.json` path
  regardless of `STORAGE_BACKEND`, which would silently defeat the Postgres
  backend for skill/agent resolution during a workflow run.

For true multi-statement atomicity beyond what `createPostgresStores` provides
out of the box, wrap a `BEGIN/COMMIT` using a dedicated pooled client (the
`transaction` TODO in `sql-store.ts`) — not required for the common
single-statement paths this app uses.

### C. Turso / libSQL, Neon serverless, etc.

Any driver reduces to the same `SqlDatabase`: wrap its execute into
`query(sql, params) => ({ rows })`, pass it to `createSqlStores(db)`, and add a
`STORAGE_BACKEND` case. libSQL uses `?` placeholders, so no rewrite is needed.

---

## The CLI/MCP fork

After moving the deployed app to a DB, the registry **forks into two
datastores** (this is intentional and documented):

- The deployed app's source of truth becomes the DB.
- The **CLI** and **MCP** server on a developer's laptop keep using the
  synchronous `LocalRegistry` over the local `.agentos/registry.json`.

→ An agent created via the CLI will **not** appear in the deployed dashboard and
vice-versa. The seed from `.agentos/registry.json` is a **one-time snapshot, not
an ongoing sync**. If you want CLI-published skills to show in the live
dashboard, the CLI/MCP must *also* be pointed at the DB (a thin HTTP client or a
remote-DB `@agentos/sdk` path) — additional scope. This matches the
"Operational consequence" callout in
[`cloudflare-deploy-plan.md`](./cloudflare-deploy-plan.md) §3.

---

## Files

| File | Role |
| --- | --- |
| `packages/sdk/src/storage/types.ts` | `RegistryStore` / `RunsStore` interfaces + record types |
| `packages/sdk/src/storage/registry-logic.ts` *(in `registry/`)* | Shared pure logic (the single source of truth) |
| `packages/sdk/src/storage/file-store.ts` | `FileRegistryStore` / `FileRunsStore` (atomic, race-free) |
| `packages/sdk/src/storage/memory-store.ts` | In-memory stores + `AsyncLock` |
| `packages/sdk/src/storage/factory.ts` | Default path resolution + store construction |
| `packages/sdk/src/storage/sql-store.ts` | **DB-adapter sketch** — `SqlDatabase`, `SqlRegistryStore`, `SqlRunsStore`, `SQL_SCHEMA`, `createPostgresStores`/`createD1Stores` |
| `packages/frontend/lib/registry-server.ts` | `STORAGE_BACKEND` selector for the registry store |
| `packages/frontend/lib/runs-store.ts` | `STORAGE_BACKEND` selector for the runs store |
| [`docs/cloudflare-deploy-plan.md`](./cloudflare-deploy-plan.md) | The Workers/D1 deploy plan this adapter unblocks |
