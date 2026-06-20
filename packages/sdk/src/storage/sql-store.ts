/**
 * Reference SQL-backed {@link RegistryStore} / {@link RunsStore} adapter.
 *
 * THIS IS A SKETCH, NOT A LIVE CONNECTION. It type-checks and demonstrates the
 * exact shape a real database backend (Vercel Postgres, Cloudflare D1, Turso /
 * libSQL, Neon, plain `pg`) must implement — but it opens NO socket, reads NO
 * credentials, and bundles NO driver. You wire a real DB by passing a thin
 * {@link SqlDatabase} adapter (an injected query function) to
 * {@link SqlRegistryStore} / {@link SqlRunsStore}; see `docs/storage-adapter.md`
 * and {@link createPostgresStores} / {@link createD1Stores} below for the
 * driver-specific glue (each marked TODO where the user supplies the client).
 *
 * Why this exists: Phase A added the async {@link RegistryStore}/{@link RunsStore}
 * interfaces and Phase B migrated the frontend onto them, so route code already
 * depends only on the interface. Dropping in a real DB therefore requires NO
 * route changes — only a new store impl selected by the `STORAGE_BACKEND` env
 * (see `packages/frontend/lib/registry-server.ts`). This file is that impl's
 * reference shape.
 *
 * Design notes:
 *  - The registry is low-write and the pure mutation/validation/search logic
 *    already lives in `../registry/registry-logic.js`. To guarantee the SQL
 *    backend can NEVER diverge from the file/in-memory backends in how it
 *    normalizes names, scores search, dedupes namespaces, or cascades a remove,
 *    the registry store loads the relevant rows into an in-memory
 *    {@link RegistryFile} snapshot, runs the SAME pure logic, then writes the
 *    result back. Mutations run inside {@link SqlDatabase.transaction} so a
 *    register/publish/remove is atomic and concurrency-safe at the DB level
 *    (the DB's own MVCC/locking replaces the file store's per-path AsyncLock).
 *  - The runs store maps 1:1 to rows — `appendRun` is a single `INSERT`, which
 *    structurally eliminates the read-modify-write data-loss race that the old
 *    frontend `runs-store.ts` had (whole-file load → push → save dropped
 *    concurrent records). `listRuns`/`getRun` are plain indexed `SELECT`s.
 *
 * Placeholder dialect: bind parameters are written as `?` (D1 / libSQL / SQLite
 * style). For Postgres (`$1, $2, …`) pass a {@link SqlDatabase} whose `query`
 * rewrites placeholders, or use {@link createPostgresStores} which documents the
 * `$n` shim. Keeping ONE placeholder convention in this sketch avoids a
 * dialect-templating layer the user does not need until they pick a driver.
 */
import * as logic from "../registry/registry-logic.js";
import type {
  RegistryAgentRecord,
  RegistryFile,
  RegistrySkillRecord,
  ResolveAgentResponse,
} from "../registry/types.js";
import type {
  DelegationRecord,
  PublishSkillInput,
  RegisterAgentInput,
  RegistryStore,
  RunsStore,
  WorkflowRunRecord,
} from "./types.js";

// ---------------------------------------------------------------------------
// The generic SQL surface the user injects (the ONLY thing a real driver must
// satisfy). Deliberately minimal: query + a transaction wrapper. Both D1's
// `prepare().bind().all()`, `pg`/Vercel-Postgres `sql`/`query`, and Turso's
// `execute` reduce to this with a few lines of glue (see the create* helpers).
// ---------------------------------------------------------------------------

/** A single column-bag row as returned by the driver. */
export type SqlRow = Record<string, unknown>;

/** Result of a SQL statement: the rows it produced (empty for writes). */
export interface SqlResult {
  rows: SqlRow[];
}

/**
 * The thin database surface a SQL backend must provide. Implement this over any
 * driver; the stores below call NOTHING else.
 */
export interface SqlDatabase {
  /**
   * Run a parameterized statement. Placeholders are `?` (positional). Implementors
   * MUST use real bound parameters — never string-interpolate `params` into SQL.
   */
  query(sql: string, params?: readonly unknown[]): Promise<SqlResult>;
  /**
   * Run `fn` inside a transaction, passing a {@link SqlDatabase} bound to that
   * transaction. Commit on resolve, roll back on throw. A backend without
   * interactive transactions (e.g. D1's HTTP API) may emulate this by batching;
   * see {@link createD1Stores}. When omitted, mutations run without an explicit
   * transaction (acceptable for single-statement paths, risky for multi-row ones
   * like `removeAgent`'s cascade — prefer providing it).
   */
  transaction?<T>(fn: (tx: SqlDatabase) => Promise<T>): Promise<T>;
}

/** Run `fn` in a transaction if the driver supports it, else inline. */
function withTx<T>(
  db: SqlDatabase,
  fn: (tx: SqlDatabase) => Promise<T>,
): Promise<T> {
  return db.transaction ? db.transaction(fn) : fn(db);
}

// ---------------------------------------------------------------------------
// SQL schema (also emitted verbatim in docs/storage-adapter.md). Plain enough
// to run on SQLite/D1 and Postgres alike. The frontend's RegistryFile is split
// across `agents` (+ JSON columns for the memoryNamespaces ledger and the
// delegations array) and `skills`; runs get their own append-only table.
// ---------------------------------------------------------------------------

/**
 * Portable DDL for the four tables. JSON-ish columns (`memory_namespaces`,
 * `dependencies`, `steps`) hold serialized arrays — `TEXT` works on both SQLite/
 * D1 and Postgres; on Postgres you may switch them to `JSONB`. Run this once at
 * provisioning time (`wrangler d1 execute --file`, a Postgres migration, …).
 */
export const SQL_SCHEMA = /* sql */ `
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
  agent_slug          TEXT NOT NULL,
  skill_id            TEXT NOT NULL,
  name                TEXT NOT NULL,
  mvr_package         TEXT NOT NULL,
  version             TEXT NOT NULL,
  walrus_manifest_blob TEXT NOT NULL,
  manifest_hash       TEXT NOT NULL,
  object_id           TEXT NOT NULL,
  suins_name          TEXT,
  seal_policy_id      TEXT,
  network             TEXT NOT NULL,
  status              TEXT NOT NULL DEFAULT 'active',
  resolutions         TEXT NOT NULL DEFAULT '0',
  last_updated        TEXT NOT NULL,
  icon                TEXT NOT NULL DEFAULT 'token',
  source              TEXT,
  dependencies        TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (agent_slug, skill_id),
  FOREIGN KEY (agent_slug) REFERENCES agents(slug) ON DELETE CASCADE
);

-- Delegations are stored inline on agents.delegations (a JSON array) to match
-- the RegistryFile shape the pure logic mutates. A normalized table is offered
-- as an OPTIONAL alternative for queryability; the stores below do NOT use it.
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
`;

// ---------------------------------------------------------------------------
// Row <-> record mapping.
// ---------------------------------------------------------------------------

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

function parseJsonArray<T>(v: unknown): T[] {
  if (Array.isArray(v)) return v as T[];
  if (typeof v !== "string" || v.length === 0) return [];
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function rowToAgent(row: SqlRow): RegistryAgentRecord {
  const memoryNamespaces = parseJsonArray<string>(row.memory_namespaces);
  const delegations = parseJsonArray<DelegationRecord>(row.delegations);
  const agent: RegistryAgentRecord = {
    slug: str(row.slug),
    suinsName: str(row.suins_name),
    passportId: str(row.passport_id),
    runtimeWallet: str(row.runtime_wallet),
    network: str(row.network) === "mainnet" ? "mainnet" : "testnet",
    passportVersion: str(row.passport_version),
    status: str(row.status) === "revoked" ? "revoked" : "active",
    createdAt: str(row.created_at),
    ...(row.description ? { description: str(row.description) } : {}),
    ...(memoryNamespaces.length ? { memoryNamespaces } : {}),
    ...(delegations.length ? { delegations } : {}),
  };
  return agent;
}

function rowToSkill(row: SqlRow): RegistrySkillRecord {
  const dependencies = parseJsonArray<string>(row.dependencies);
  const icon = str(row.icon);
  const skill: RegistrySkillRecord = {
    agentSlug: str(row.agent_slug),
    skillId: str(row.skill_id),
    name: str(row.name),
    mvrPackage: str(row.mvr_package),
    version: str(row.version),
    walrusManifestBlob: str(row.walrus_manifest_blob),
    manifestHash: str(row.manifest_hash),
    objectId: str(row.object_id),
    network: str(row.network) === "mainnet" ? "mainnet" : "testnet",
    status: str(row.status) === "archived" ? "archived" : "active",
    resolutions: str(row.resolutions),
    lastUpdated: str(row.last_updated),
    icon: icon === "wallet" || icon === "swap" ? icon : "token",
    ...(row.suins_name ? { suinsName: str(row.suins_name) } : {}),
    ...(row.seal_policy_id ? { sealPolicyId: str(row.seal_policy_id) } : {}),
    ...(row.source
      ? { source: str(row.source) as RegistrySkillRecord["source"] }
      : {}),
    ...(dependencies.length ? { dependencies } : {}),
  };
  return skill;
}

function rowToRun(row: SqlRow): WorkflowRunRecord {
  return {
    runId: str(row.run_id),
    agentSlug: str(row.agent_slug),
    status: str(row.status) === "error" ? "error" : "done",
    steps: parseJsonArray(row.steps),
    createdAt: str(row.created_at),
  };
}

// ---------------------------------------------------------------------------
// SqlRegistryStore — loads rows into a RegistryFile, runs the SHARED pure logic,
// writes the result back inside a transaction so it cannot diverge from the
// file/memory backends.
// ---------------------------------------------------------------------------

export class SqlRegistryStore implements RegistryStore {
  #db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.#db = db;
  }

  /** Load the full registry document from SQL (agents + skills). */
  async #load(db: SqlDatabase = this.#db): Promise<RegistryFile> {
    const [agentsRes, skillsRes] = await Promise.all([
      db.query("SELECT * FROM agents"),
      db.query("SELECT * FROM skills"),
    ]);
    return {
      version: 1,
      agents: agentsRes.rows.map(rowToAgent),
      skills: skillsRes.rows.map(rowToSkill),
    };
  }

  /** Upsert one agent record (used by mutations after pure logic runs). */
  async #upsertAgent(db: SqlDatabase, a: RegistryAgentRecord): Promise<void> {
    await db.query(
      `INSERT INTO agents
         (slug, suins_name, passport_id, runtime_wallet, network,
          passport_version, status, created_at, description,
          memory_namespaces, delegations)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(slug) DO UPDATE SET
         suins_name = excluded.suins_name,
         passport_id = excluded.passport_id,
         runtime_wallet = excluded.runtime_wallet,
         network = excluded.network,
         passport_version = excluded.passport_version,
         status = excluded.status,
         created_at = excluded.created_at,
         description = excluded.description,
         memory_namespaces = excluded.memory_namespaces,
         delegations = excluded.delegations`,
      [
        a.slug,
        a.suinsName,
        a.passportId,
        a.runtimeWallet,
        a.network,
        a.passportVersion,
        a.status,
        a.createdAt,
        a.description ?? null,
        JSON.stringify(a.memoryNamespaces ?? []),
        JSON.stringify(a.delegations ?? []),
      ],
    );
  }

  /** Upsert one skill record. */
  async #upsertSkill(db: SqlDatabase, s: RegistrySkillRecord): Promise<void> {
    await db.query(
      `INSERT INTO skills
         (agent_slug, skill_id, name, mvr_package, version,
          walrus_manifest_blob, manifest_hash, object_id, suins_name,
          seal_policy_id, network, status, resolutions, last_updated, icon,
          source, dependencies)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(agent_slug, skill_id) DO UPDATE SET
         name = excluded.name,
         mvr_package = excluded.mvr_package,
         version = excluded.version,
         walrus_manifest_blob = excluded.walrus_manifest_blob,
         manifest_hash = excluded.manifest_hash,
         object_id = excluded.object_id,
         suins_name = excluded.suins_name,
         seal_policy_id = excluded.seal_policy_id,
         network = excluded.network,
         status = excluded.status,
         resolutions = excluded.resolutions,
         last_updated = excluded.last_updated,
         icon = excluded.icon,
         source = excluded.source,
         dependencies = excluded.dependencies`,
      [
        s.agentSlug,
        s.skillId,
        s.name,
        s.mvrPackage,
        s.version,
        s.walrusManifestBlob,
        s.manifestHash,
        s.objectId,
        s.suinsName ?? null,
        s.sealPolicyId ?? null,
        s.network,
        s.status,
        s.resolutions,
        s.lastUpdated,
        s.icon,
        s.source ?? null,
        JSON.stringify(s.dependencies ?? []),
      ],
    );
  }

  // ----- Reads (load snapshot, delegate to shared pure logic) -----

  async getAgents(): Promise<RegistryAgentRecord[]> {
    return (await this.#load()).agents;
  }

  async getSkills(): Promise<RegistrySkillRecord[]> {
    return (await this.#load()).skills;
  }

  async listAgents(): Promise<RegistryAgentRecord[]> {
    return logic.listAgents(await this.#load());
  }

  async resolveAgent(name: string): Promise<ResolveAgentResponse | null> {
    return logic.resolveAgent(await this.#load(), name);
  }

  async findAgentBySuins(
    suinsName: string,
  ): Promise<RegistryAgentRecord | undefined> {
    return logic.findAgentBySuins(await this.#load(), suinsName);
  }

  async listSkills(agentName: string): Promise<RegistrySkillRecord[]> {
    return logic.listSkills(await this.#load(), agentName);
  }

  async searchAgents(query: string, limit = 6): Promise<RegistryAgentRecord[]> {
    // Uses the SAME scoring as the file/memory backends. A real backend may
    // later push a coarse `WHERE suins_name LIKE ?` prefilter into SQL and keep
    // this in-memory ranking for the final order — out of scope for the sketch.
    return logic.searchAgents(await this.#load(), query, limit);
  }

  async listMemoryNamespaces(agentName: string): Promise<string[]> {
    return logic.listMemoryNamespaces(await this.#load(), agentName);
  }

  async listDelegations(agentName: string): Promise<DelegationRecord[]> {
    return logic.listDelegations(await this.#load(), agentName);
  }

  // ----- Mutations (load -> pure logic -> persist, inside a transaction) -----

  registerAgent(input: RegisterAgentInput): Promise<RegistryAgentRecord> {
    return withTx(this.#db, async (tx) => {
      const data = await this.#load(tx);
      const { value } = logic.registerAgent(data, input);
      await this.#upsertAgent(tx, value);
      return value;
    });
  }

  removeAgent(name: string): Promise<RegistryAgentRecord> {
    return withTx(this.#db, async (tx) => {
      const data = await this.#load(tx);
      const { value } = logic.removeAgent(data, name);
      // Cascade: delete the agent (FK ON DELETE CASCADE clears its skills, but
      // delete skills explicitly too for backends without enforced FKs).
      await tx.query("DELETE FROM skills WHERE agent_slug = ?", [value.slug]);
      await tx.query("DELETE FROM agents WHERE slug = ?", [value.slug]);
      return value;
    });
  }

  publishSkill(input: PublishSkillInput): Promise<RegistrySkillRecord> {
    return withTx(this.#db, async (tx) => {
      const data = await this.#load(tx);
      const { value } = logic.publishSkill(data, input);
      await this.#upsertSkill(tx, value);
      return value;
    });
  }

  recordMemoryNamespace(
    agentName: string,
    namespace: string,
  ): Promise<string[]> {
    return withTx(this.#db, async (tx) => {
      const data = await this.#load(tx);
      const { value, changed } = logic.recordMemoryNamespace(
        data,
        agentName,
        namespace,
      );
      if (changed) {
        const agent = logic.resolveAgent(data, agentName)?.agent;
        if (agent) await this.#upsertAgent(tx, agent);
      }
      return value;
    });
  }

  addDelegation(
    agentName: string,
    delegation: DelegationRecord,
  ): Promise<void> {
    return withTx(this.#db, async (tx) => {
      const data = await this.#load(tx);
      logic.addDelegation(data, agentName, delegation);
      const agent = logic.resolveAgent(data, agentName)?.agent;
      if (agent) await this.#upsertAgent(tx, agent);
    });
  }
}

// ---------------------------------------------------------------------------
// SqlRunsStore — 1:1 row mapping. appendRun is one INSERT (no RMW race).
// ---------------------------------------------------------------------------

export class SqlRunsStore implements RunsStore {
  #db: SqlDatabase;

  constructor(db: SqlDatabase) {
    this.#db = db;
  }

  async appendRun(run: WorkflowRunRecord): Promise<WorkflowRunRecord> {
    // Single atomic INSERT — concurrent appends are independent rows, so the
    // old whole-file read-modify-write data-loss race is structurally gone.
    await this.#db.query(
      `INSERT INTO runs (run_id, agent_slug, status, steps, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(run_id) DO UPDATE SET
         agent_slug = excluded.agent_slug,
         status = excluded.status,
         steps = excluded.steps,
         created_at = excluded.created_at`,
      [
        run.runId,
        run.agentSlug,
        run.status,
        JSON.stringify(run.steps),
        run.createdAt,
      ],
    );
    return run;
  }

  async listRuns(agentSlug: string): Promise<WorkflowRunRecord[]> {
    // The (agent_slug, created_at DESC) index preserves the newest-first order
    // the file/memory backends produce via localeCompare(createdAt).
    const res = await this.#db.query(
      "SELECT * FROM runs WHERE agent_slug = ? ORDER BY created_at DESC",
      [agentSlug],
    );
    return res.rows.map(rowToRun);
  }

  async getRun(runId: string): Promise<WorkflowRunRecord | undefined> {
    const res = await this.#db.query("SELECT * FROM runs WHERE run_id = ?", [
      runId,
    ]);
    const row = res.rows[0];
    return row ? rowToRun(row) : undefined;
  }
}

// ---------------------------------------------------------------------------
// Driver glue SKETCHES. These document HOW to build a SqlDatabase from a real
// client. They are intentionally not wired to a live connection — each TODO is
// where the user injects their authed client. No driver is imported here, so
// the SDK builds without any DB dependency.
// ---------------------------------------------------------------------------

export interface SqlStores {
  registry: SqlRegistryStore;
  runs: SqlRunsStore;
}

/** Build both stores from one {@link SqlDatabase}. */
export function createSqlStores(db: SqlDatabase): SqlStores {
  return { registry: new SqlRegistryStore(db), runs: new SqlRunsStore(db) };
}

/**
 * SKETCH: Vercel Postgres / Neon / node-`pg`.
 *
 * Postgres uses `$1, $2, …` placeholders, so this shim rewrites the `?` the
 * stores emit into `$n` before calling the user's `query`. `ON CONFLICT … DO
 * UPDATE SET … = excluded.col` is valid Postgres, so the upserts port as-is.
 *
 * @param query - The user's authed query function, e.g. from
 *   `import { sql } from "@vercel/postgres"` (wrap `sql.query`) or a `pg.Pool`:
 *   `(text, params) => pool.query(text, params).then(r => ({ rows: r.rows }))`.
 *   TODO(user): provide this — that is the only place a real connection appears.
 */
export function createPostgresStores(
  query: (sql: string, params: readonly unknown[]) => Promise<{ rows: SqlRow[] }>,
): SqlStores {
  const toPgPlaceholders = (sql: string): string => {
    let i = 0;
    return sql.replace(/\?/g, () => `$${++i}`);
  };
  const db: SqlDatabase = {
    async query(sql, params = []) {
      const { rows } = await query(toPgPlaceholders(sql), params);
      return { rows };
    },
    // TODO(user): for real atomicity wrap a `BEGIN/COMMIT/ROLLBACK` here using a
    // dedicated pooled client (`pool.connect()`), binding `tx.query` to it.
    // Omitting `transaction` lets multi-statement mutations run without one.
  };
  return createSqlStores(db);
}

/**
 * SKETCH: Cloudflare D1.
 *
 * D1 speaks `?` placeholders natively (matching the stores), so no rewrite is
 * needed. D1 has no interactive `BEGIN/COMMIT`; use `db.batch([...])` for atomic
 * multi-statement writes (left as a TODO — the stores work without an explicit
 * transaction for the common single-statement paths).
 *
 * @param d1 - The bound `env.AGENTOS_DB` (typed loosely so the SDK needs no
 *   `@cloudflare/workers-types` dependency). Inside a Worker:
 *   `createD1Stores(getCloudflareContext().env.AGENTOS_DB)`.
 *   TODO(user): pass the real binding — that is the only place D1 appears.
 */
export function createD1Stores(d1: {
  prepare(sql: string): {
    bind(...params: unknown[]): { all(): Promise<{ results?: SqlRow[] }> };
  };
}): SqlStores {
  const db: SqlDatabase = {
    async query(sql, params = []) {
      const stmt = d1.prepare(sql).bind(...params);
      const res = await stmt.all();
      return { rows: res.results ?? [] };
    },
    // TODO(user): D1 has no interactive transactions. For the multi-row
    // removeAgent cascade, batch the DELETEs via `d1.batch([...])` instead, or
    // rely on the FK `ON DELETE CASCADE` in SQL_SCHEMA.
  };
  return createSqlStores(db);
}
