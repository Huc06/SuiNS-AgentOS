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
