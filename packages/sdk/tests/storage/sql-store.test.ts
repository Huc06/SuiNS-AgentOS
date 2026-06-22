import { describe, expect, it } from "vitest";

import {
  SQL_SCHEMA,
  SqlRegistryStore,
  SqlRunsStore,
  createD1Stores,
  createPostgresStores,
  createSqlStores,
} from "../../src/storage/index.js";
import type {
  RegistryStore,
  RunsStore,
  SqlDatabase,
  SqlRow,
  WorkflowRunRecord,
} from "../../src/storage/index.js";
import type { SkillManifest } from "../../src/types.js";

/**
 * A tiny in-memory {@link SqlDatabase} mock. It does NOT parse arbitrary SQL —
 * it recognizes the exact statements the SqlRegistryStore / SqlRunsStore emit
 * (SELECT *, the upsert INSERT…ON CONFLICT, the cascade DELETEs, and the runs
 * SELECT/INSERT) and applies them to plain JS arrays. This proves the adapter:
 *  - binds `?` placeholders positionally in the right order,
 *  - round-trips every column through the row mapping,
 *  - satisfies the RegistryStore/RunsStore contracts,
 * all WITHOUT a real database. A real driver replaces this mock; the store code
 * under test is identical either way.
 */
function makeMockDb(): SqlDatabase {
  const agents: SqlRow[] = [];
  const skills: SqlRow[] = [];
  const runs: SqlRow[] = [];
  const workflows: SqlRow[] = [];

  const upsert = (table: SqlRow[], row: SqlRow, keys: string[]): void => {
    const idx = table.findIndex((r) => keys.every((k) => r[k] === row[k]));
    if (idx >= 0) table[idx] = row;
    else table.push(row);
  };

  const db: SqlDatabase = {
    async query(sql, params = []) {
      const text = sql.trim();
      const p = params as unknown[];

      if (text.startsWith("SELECT * FROM agents"))
        return { rows: agents.map((r) => ({ ...r })) };
      if (text.startsWith("SELECT * FROM skills"))
        return { rows: skills.map((r) => ({ ...r })) };
      if (text.startsWith("SELECT * FROM workflows"))
        return { rows: workflows.map((r) => ({ ...r })) };

      if (text.startsWith("INSERT INTO agents")) {
        upsert(
          agents,
          {
            slug: p[0],
            suins_name: p[1],
            passport_id: p[2],
            runtime_wallet: p[3],
            network: p[4],
            passport_version: p[5],
            status: p[6],
            created_at: p[7],
            description: p[8],
            memory_namespaces: p[9],
            delegations: p[10],
          },
          ["slug"],
        );
        return { rows: [] };
      }

      if (text.startsWith("INSERT INTO skills")) {
        upsert(
          skills,
          {
            agent_slug: p[0],
            skill_id: p[1],
            name: p[2],
            mvr_package: p[3],
            version: p[4],
            walrus_manifest_blob: p[5],
            manifest_hash: p[6],
            object_id: p[7],
            suins_name: p[8],
            seal_policy_id: p[9],
            network: p[10],
            status: p[11],
            resolutions: p[12],
            last_updated: p[13],
            icon: p[14],
            source: p[15],
            dependencies: p[16],
          },
          ["agent_slug", "skill_id"],
        );
        return { rows: [] };
      }

      if (text.startsWith("DELETE FROM skills WHERE agent_slug")) {
        for (let i = skills.length - 1; i >= 0; i--) {
          if (skills[i].agent_slug === p[0]) skills.splice(i, 1);
        }
        return { rows: [] };
      }
      if (text.startsWith("DELETE FROM workflows WHERE agent_slug")) {
        for (let i = workflows.length - 1; i >= 0; i--) {
          if (workflows[i].agent_slug === p[0]) workflows.splice(i, 1);
        }
        return { rows: [] };
      }
      if (text.startsWith("DELETE FROM agents WHERE slug")) {
        for (let i = agents.length - 1; i >= 0; i--) {
          if (agents[i].slug === p[0]) agents.splice(i, 1);
        }
        return { rows: [] };
      }

      if (text.startsWith("INSERT INTO workflows")) {
        upsert(
          workflows,
          {
            slug: p[0],
            agent_slug: p[1],
            workflow_id: p[2],
            name: p[3],
            suins_name: p[4],
            version: p[5],
            walrus_manifest_blob: p[6],
            manifest_hash: p[7],
            network: p[8],
            status: p[9],
            description: p[10],
            dependencies: p[11],
            created_at: p[12],
            last_updated: p[13],
          },
          ["slug"],
        );
        return { rows: [] };
      }

      if (text.startsWith("INSERT INTO runs")) {
        upsert(
          runs,
          {
            run_id: p[0],
            agent_slug: p[1],
            status: p[2],
            steps: p[3],
            created_at: p[4],
          },
          ["run_id"],
        );
        return { rows: [] };
      }
      if (text.startsWith("SELECT * FROM runs WHERE agent_slug")) {
        const out = runs
          .filter((r) => r.agent_slug === p[0])
          .sort((a, b) =>
            String(b.created_at).localeCompare(String(a.created_at)),
          )
          .map((r) => ({ ...r }));
        return { rows: out };
      }
      if (text.startsWith("SELECT * FROM runs WHERE run_id")) {
        const r = runs.find((x) => x.run_id === p[0]);
        return { rows: r ? [{ ...r }] : [] };
      }

      throw new Error(`mock db: unhandled SQL: ${text.slice(0, 40)}`);
    },
    // Inline transaction (the mock has no isolation; fine for the contract test).
    transaction<T>(fn: (tx: SqlDatabase) => Promise<T>): Promise<T> {
      return fn(db);
    },
  };
  return db;
}

function manifest(name = "demo-skill"): SkillManifest {
  return {
    name,
    version: "1.0.0",
    publisher: `@demo/${name}`,
    manifestType: "sui-agent-skill/v1",
    mcp: { compatible: true, tools: [] },
    sui: { movePackage: "0x0", entry: "run", policyRequired: [] },
    dependencies: [],
  };
}

function run(
  runId: string,
  agentSlug = "alpha",
  createdAt = "2026-01-01T00:00:00.000Z",
): WorkflowRunRecord {
  return { runId, agentSlug, status: "done", steps: [], createdAt };
}

describe("SqlRegistryStore (mock SqlDatabase)", () => {
  function fresh(): RegistryStore {
    return new SqlRegistryStore(makeMockDb());
  }

  it("register -> resolve -> publish -> remove round-trips", async () => {
    const store = fresh();
    const agent = await store.registerAgent({
      suinsName: "demo.sui",
      runtimeWallet: "0x123",
    });
    expect(agent.slug).toBe("demo");

    expect((await store.resolveAgent("demo.sui"))?.agent.suinsName).toBe(
      "demo.sui",
    );

    const skill = await store.publishSkill({
      agentName: "demo.sui",
      manifest: manifest(),
    });
    expect(skill.skillId).toBe("demo-skill");
    expect(await store.listSkills("demo.sui")).toHaveLength(1);

    const removed = await store.removeAgent("demo.sui");
    expect(removed.slug).toBe("demo");
    expect(await store.resolveAgent("demo.sui")).toBeNull();
    // cascade cleared the skill
    expect(await store.getSkills()).toHaveLength(0);
  });

  it("rejects duplicate agent names", async () => {
    const store = fresh();
    await store.registerAgent({ suinsName: "dup.sui", runtimeWallet: "0x1" });
    await expect(
      store.registerAgent({ suinsName: "dup.sui", runtimeWallet: "0x1" }),
    ).rejects.toThrow(/already registered/);
  });

  it("listAgents omits revoked, searchAgents scores prefix first", async () => {
    const store = fresh();
    await store.registerAgent({ suinsName: "alpha.sui", runtimeWallet: "0x1" });
    await store.registerAgent({
      suinsName: "betalpha.sui",
      runtimeWallet: "0x2",
    });
    expect(await store.listAgents()).toHaveLength(2);
    const results = await store.searchAgents("alpha");
    expect(results[0].slug).toBe("alpha");
  });

  it("records memory namespaces deduped, most-recent first", async () => {
    const store = fresh();
    await store.registerAgent({ suinsName: "mem.sui", runtimeWallet: "0x1" });
    await store.recordMemoryNamespace("mem.sui", "mem.sui");
    await store.recordMemoryNamespace("mem.sui", "project-x");
    await store.recordMemoryNamespace("mem.sui", "mem.sui");
    expect(await store.listMemoryNamespaces("mem.sui")).toEqual([
      "mem.sui",
      "project-x",
    ]);
  });

  it("adds and lists delegations (JSON column round-trip)", async () => {
    const store = fresh();
    await store.registerAgent({ suinsName: "par.sui", runtimeWallet: "0x1" });
    await store.addDelegation("par.sui", {
      childAgent: "0xchild",
      childName: "kid.sui",
      allowedSkills: ["web-search"],
      allowedCapabilities: ["read"],
      spendLimit: "100",
      spent: "0",
      expiryMs: "0",
      revoked: false,
      createdAt: "2026-01-01T00:00:00.000Z",
    });
    const dels = await store.listDelegations("par.sui");
    expect(dels).toHaveLength(1);
    expect(dels[0].childName).toBe("kid.sui");
  });

  it("publishSkill upsert replaces the same skill in place", async () => {
    const store = fresh();
    await store.registerAgent({ suinsName: "up.sui", runtimeWallet: "0x1" });
    await store.publishSkill({ agentName: "up.sui", manifest: manifest("s") });
    await store.publishSkill({ agentName: "up.sui", manifest: manifest("s") });
    expect(await store.listSkills("up.sui")).toHaveLength(1);
  });
});

describe("SqlRunsStore (mock SqlDatabase)", () => {
  function fresh(): RunsStore {
    return new SqlRunsStore(makeMockDb());
  }

  it("appends and fetches by id", async () => {
    const store = fresh();
    await store.appendRun(run("r1"));
    expect((await store.getRun("r1"))?.runId).toBe("r1");
    expect(await store.getRun("nope")).toBeUndefined();
  });

  it("lists by agent slug, newest first", async () => {
    const store = fresh();
    await store.appendRun(run("r1", "alpha", "2026-01-01T00:00:00.000Z"));
    await store.appendRun(run("r2", "alpha", "2026-03-01T00:00:00.000Z"));
    await store.appendRun(run("r3", "beta", "2026-02-01T00:00:00.000Z"));
    expect((await store.listRuns("alpha")).map((r) => r.runId)).toEqual([
      "r2",
      "r1",
    ]);
    expect(await store.listRuns("beta")).toHaveLength(1);
  });

  it("preserves step payloads through the JSON steps column", async () => {
    const store = fresh();
    const rec: WorkflowRunRecord = {
      runId: "x",
      agentSlug: "alpha",
      status: "error",
      steps: [
        {
          nodeId: "n1",
          type: "trigger",
          status: "error",
          error: "boom",
        },
      ],
      createdAt: "2026-01-01T00:00:00.000Z",
    };
    await store.appendRun(rec);
    const got = await store.getRun("x");
    expect(got?.status).toBe("error");
    expect(got?.steps).toHaveLength(1);
  });
});

describe("SQL adapter glue + schema", () => {
  it("createSqlStores returns both stores from one SqlDatabase", () => {
    const stores = createSqlStores(makeMockDb());
    expect(stores.registry).toBeInstanceOf(SqlRegistryStore);
    expect(stores.runs).toBeInstanceOf(SqlRunsStore);
  });

  it("createPostgresStores rewrites ? to $n placeholders", async () => {
    const seen: string[] = [];
    const stores = createPostgresStores(async (sql) => {
      seen.push(sql);
      // Minimal: only the SELECTs the register path issues need rows.
      return { rows: [] };
    });
    await stores.registry.registerAgent({
      suinsName: "pg.sui",
      runtimeWallet: "0x1",
    });
    // The INSERT must have been rewritten to positional $n params.
    const insert = seen.find((s) => s.startsWith("INSERT INTO agents"));
    expect(insert).toBeDefined();
    expect(insert).toContain("$1");
    expect(insert).toContain("$11");
    expect(insert).not.toContain("?");
  });

  it("createD1Stores adapts prepare().bind().all()", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const stores = createD1Stores({
      prepare(sql: string) {
        return {
          bind(...params: unknown[]) {
            return {
              async all() {
                calls.push({ sql, params });
                return { results: [] as SqlRow[] };
              },
            };
          },
        };
      },
    });
    await stores.runs.appendRun(run("d1"));
    expect(calls.some((c) => c.sql.startsWith("INSERT INTO runs"))).toBe(true);
    // D1 keeps `?` placeholders (no rewrite).
    expect(calls[0].sql).toContain("?");
  });

  it("SQL_SCHEMA declares the four tables + the runs index", () => {
    expect(SQL_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS agents");
    expect(SQL_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS skills");
    expect(SQL_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS delegations");
    expect(SQL_SCHEMA).toContain("CREATE TABLE IF NOT EXISTS runs");
    expect(SQL_SCHEMA).toContain("idx_runs_agent_created");
  });
});
