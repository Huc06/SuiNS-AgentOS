import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  FileRunsStore,
  InMemoryRunsStore,
} from "../../src/storage/index.js";
import type { RunsStore, WorkflowRunRecord } from "../../src/storage/index.js";

function run(
  runId: string,
  agentSlug = "alpha",
  createdAt = "2026-01-01T00:00:00.000Z",
): WorkflowRunRecord {
  return {
    runId,
    agentSlug,
    status: "done",
    steps: [],
    createdAt,
  };
}

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "agentos-runs-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function suite(make: () => RunsStore, label: string) {
  describe(`RunsStore behavior — ${label}`, () => {
    it("appends and fetches by id", async () => {
      const store = make();
      await store.appendRun(run("r1"));
      const got = await store.getRun("r1");
      expect(got?.runId).toBe("r1");
      expect(await store.getRun("nope")).toBeUndefined();
    });

    it("lists by agent slug, newest first", async () => {
      const store = make();
      await store.appendRun(run("r1", "alpha", "2026-01-01T00:00:00.000Z"));
      await store.appendRun(run("r2", "alpha", "2026-03-01T00:00:00.000Z"));
      await store.appendRun(run("r3", "beta", "2026-02-01T00:00:00.000Z"));

      const alpha = await store.listRuns("alpha");
      expect(alpha.map((r) => r.runId)).toEqual(["r2", "r1"]);
      expect(await store.listRuns("beta")).toHaveLength(1);
    });

    it("CONCURRENT appendRun never loses a record (the bug)", async () => {
      const store = make();
      const N = 50;
      await Promise.all(
        Array.from({ length: N }, (_, i) =>
          store.appendRun(run(`run-${i}`, "alpha", `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`)),
        ),
      );
      const all = await store.listRuns("alpha");
      expect(all).toHaveLength(N);
      expect(new Set(all.map((r) => r.runId)).size).toBe(N);
    });
  });
}

suite(() => new InMemoryRunsStore(), "InMemoryRunsStore");
suite(() => new FileRunsStore(join(dir, "runs.d")), "FileRunsStore");

describe("FileRunsStore — file-per-run + legacy back-compat", () => {
  it("reads records from a legacy single runs.json file", async () => {
    const legacyFile = join(dir, "runs.json");
    writeFileSync(
      legacyFile,
      JSON.stringify({
        version: 1,
        runs: [run("legacy-1", "alpha"), run("legacy-2", "alpha")],
      }),
      "utf8",
    );

    const store = new FileRunsStore(join(dir, "runs.d"), { legacyFile });
    // New append lands as a per-run file.
    await store.appendRun(run("new-1", "alpha", "2026-09-01T00:00:00.000Z"));

    const all = await store.listRuns("alpha");
    expect(all.map((r) => r.runId).sort()).toEqual([
      "legacy-1",
      "legacy-2",
      "new-1",
    ]);
    // newest-first: the 2026-09 record leads.
    expect(all[0].runId).toBe("new-1");
  });

  it("per-run file dedupes against a legacy record with the same id", async () => {
    const legacyFile = join(dir, "runs.json");
    writeFileSync(
      legacyFile,
      JSON.stringify({ version: 1, runs: [run("dup", "alpha")] }),
      "utf8",
    );
    const store = new FileRunsStore(join(dir, "runs.d"), { legacyFile });
    await store.appendRun(run("dup", "alpha"));

    const all = await store.listRuns("alpha");
    expect(all).toHaveLength(1);
  });

  it("tolerates a corrupt per-run file when listing", async () => {
    const runsDir = join(dir, "runs.d");
    mkdirSync(runsDir, { recursive: true });
    writeFileSync(join(runsDir, "bad.json"), "{ not json", "utf8");

    const store = new FileRunsStore(runsDir);
    await store.appendRun(run("good", "alpha"));

    const all = await store.listRuns("alpha");
    expect(all.map((r) => r.runId)).toEqual(["good"]);
  });

  it("getRun returns undefined for unknown ids and survives empty dir", async () => {
    const store = new FileRunsStore(join(dir, "runs.d"));
    expect(await store.getRun("missing")).toBeUndefined();
    expect(await store.listRuns("alpha")).toEqual([]);
  });
});
