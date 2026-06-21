import { join } from "node:path";

import { createDefaultRunsStore, type RunsStore } from "@agentos/sdk/node";
import type { WorkflowRunRecord } from "@agentos/sdk/node";

export type { WorkflowRunRecord };

/**
 * Workflow-run persistence for the deployed app.
 *
 * Delegates to the async {@link RunsStore} from `@agentos/sdk/node`. The default
 * file-backed impl writes ONE FILE PER RUN (in `runs.d/`), which eliminates the
 * old `appendRun` read-modify-write race that silently dropped concurrent runs.
 * Behavior is otherwise identical: runs live next to the registry (the repo-root
 * `.agentos/` dir, or `/tmp` on Vercel) and legacy `runs.json` is still read for
 * back-compat. `STORAGE_BACKEND=memory` switches to an ephemeral store for a
 * read-only serverless filesystem.
 */

type StorageBackend = "file" | "memory";

function selectedBackend(): StorageBackend {
  const raw = process.env.STORAGE_BACKEND?.trim().toLowerCase();
  if (raw === "memory") return "memory";
  return "file";
}

/**
 * Path to the bundled demo runs that ship with the build. On a cold/ephemeral
 * filesystem the SDK store seeds these once so the Analytics dashboard shows
 * meaningful data out of the box (mirrors `registry.seed.json`). Real runs
 * (user workflow executions) are never overwritten — seeding only fills an
 * empty store.
 */
const BUNDLED_RUNS = join(process.cwd(), "lib", "runs.seed.json");

/**
 * Process-wide cached store. The in-memory backend must be cached (a fresh
 * instance per call would lose every run); the file backend caches to reuse its
 * per-path async lock that serializes concurrent appends.
 */
let cached: { backend: StorageBackend; store: RunsStore } | undefined;

function getRunsStore(): RunsStore {
  const backend = selectedBackend();
  if (cached && cached.backend === backend) {
    return cached.store;
  }
  const store = createDefaultRunsStore({
    cwd: process.cwd(),
    repoRoot: join(process.cwd(), "../.."),
    inMemoryFallback: backend === "memory",
    bundledRuns: BUNDLED_RUNS,
  });
  cached = { backend, store };
  return store;
}

/** Append a run record to the store. Concurrency-safe (no lost records). */
export function appendRun(run: WorkflowRunRecord): Promise<WorkflowRunRecord> {
  return getRunsStore().appendRun(run);
}

/** List runs for an agent slug, newest first. */
export function listRuns(agentSlug: string): Promise<WorkflowRunRecord[]> {
  return getRunsStore().listRuns(agentSlug);
}

/** Fetch a single run by id (used for polling). */
export function getRun(
  runId: string,
): Promise<WorkflowRunRecord | undefined> {
  return getRunsStore().getRun(runId);
}
