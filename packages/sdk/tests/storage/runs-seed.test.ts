import {
  existsSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { createDefaultRunsStore } from "../../src/storage/index.js";
import type { WorkflowRunRecord } from "../../src/storage/index.js";

/**
 * Seeding behavior for {@link createDefaultRunsStore}: on a COLD store the
 * bundled demo runs are materialized so Analytics is populated; on a WARM store
 * (real runs already present) seeding is a no-op. Mirrors how the registry seeds
 * from `registry.seed.json`.
 */

const SEED_RUNS: WorkflowRunRecord[] = [
  {
    runId: "seed-a",
    agentSlug: "alpha",
    status: "done",
    steps: [{ nodeId: "t", type: "trigger", status: "done" }],
    createdAt: "2026-06-14T09:12:00.000Z",
  },
  {
    runId: "seed-b",
    agentSlug: "beta-agent",
    status: "error",
    steps: [{ nodeId: "s", type: "sui", status: "error" }],
    createdAt: "2026-06-18T08:47:00.000Z",
  },
];

let root: string;
let seedFile: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agentos-runs-seed-"));
  seedFile = join(root, "runs.seed.json");
  writeFileSync(
    seedFile,
    JSON.stringify({ version: 1, runs: SEED_RUNS }, null, 2),
    "utf8",
  );
});

afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

describe("createDefaultRunsStore — bundled demo seeding (file backend)", () => {
  it("seeds the demo runs on cold start", async () => {
    const runsPath = join(root, ".agentos", "runs.json");
    process.env.AGENTOS_RUNS_PATH = runsPath;
    try {
      const store = createDefaultRunsStore({ bundledRuns: seedFile });
      const alpha = await store.listRuns("alpha");
      const beta = await store.listRuns("beta-agent");
      expect(alpha.map((r) => r.runId)).toContain("seed-a");
      expect(beta.map((r) => r.runId)).toContain("seed-b");
    } finally {
      delete process.env.AGENTOS_RUNS_PATH;
    }
  });

  it("does NOT reseed once a real run exists (warm store)", async () => {
    const runsPath = join(root, ".agentos", "runs.json");
    process.env.AGENTOS_RUNS_PATH = runsPath;
    try {
      // First store: cold → seeds, then a real run is appended.
      const first = createDefaultRunsStore({ bundledRuns: seedFile });
      await first.appendRun({
        runId: "real-1",
        agentSlug: "alpha",
        status: "done",
        steps: [],
        createdAt: "2026-07-01T00:00:00.000Z",
      });

      // A SECOND cold-construction must NOT reseed (a per-run file now exists).
      const dir = join(root, ".agentos", "runs.d");
      const before = readdirSync(dir).filter((f) => f.endsWith(".json"));
      const second = createDefaultRunsStore({ bundledRuns: seedFile });
      const after = readdirSync(dir).filter((f) => f.endsWith(".json"));
      expect(after.length).toBe(before.length);

      const alpha = await second.listRuns("alpha");
      // The real run is present; the demo seed was NOT injected again.
      expect(alpha.some((r) => r.runId === "real-1")).toBe(true);
    } finally {
      delete process.env.AGENTOS_RUNS_PATH;
    }
  });

  it("is a no-op when no bundledRuns is supplied", async () => {
    const runsPath = join(root, ".agentos2", "runs.json");
    process.env.AGENTOS_RUNS_PATH = runsPath;
    try {
      const store = createDefaultRunsStore({});
      expect(await store.listRuns("alpha")).toEqual([]);
      // No runs dir was created just to seed.
      const dir = join(root, ".agentos2", "runs.d");
      expect(existsSync(dir)).toBe(false);
    } finally {
      delete process.env.AGENTOS_RUNS_PATH;
    }
  });
});

describe("createDefaultRunsStore — in-memory fallback seeding", () => {
  it("seeds the in-memory store from the bundled runs (ephemeral fs)", async () => {
    const store = createDefaultRunsStore({
      inMemoryFallback: true,
      bundledRuns: seedFile,
    });
    const alpha = await store.listRuns("alpha");
    const beta = await store.listRuns("beta-agent");
    expect(alpha.map((r) => r.runId)).toEqual(["seed-a"]);
    expect(beta.map((r) => r.runId)).toEqual(["seed-b"]);
  });

  it("in-memory with no seed file is empty", async () => {
    const store = createDefaultRunsStore({ inMemoryFallback: true });
    expect(await store.listRuns("alpha")).toEqual([]);
  });
});
