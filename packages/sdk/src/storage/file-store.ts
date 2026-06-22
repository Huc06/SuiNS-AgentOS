/**
 * File-backed {@link RegistryStore} / {@link RunsStore} implementations with
 * crash- and concurrency-safe writes.
 *
 * Two correctness properties this layer guarantees that the old frontend
 * `registry-server.ts` / `runs-store.ts` did NOT:
 *
 *  1. ATOMIC writes — every persist writes to a temp file then `fs.rename`s it
 *     over the target. `rename` is atomic on POSIX, so a partial/concurrent
 *     write can never leave a half-written, corrupt JSON file on disk.
 *
 *  2. APPEND-SAFE runs — {@link FileRunsStore.appendRun} writes one file per
 *     run into a directory instead of doing a whole-file load → push → save
 *     (the read-modify-write DATA-LOSS RACE: two concurrent appends each load
 *     the same N records, push one, and write N+1 — losing one record). With a
 *     file-per-run there is nothing to lose: each append is an independent
 *     atomic create. A per-path lock additionally serializes the registry's
 *     load→mutate→save so concurrent registry mutations can't clobber each
 *     other either.
 *
 * Default paths mirror the old behavior: `.agentos/registry.json` and a sibling
 * `runs/` directory (legacy single `runs.json` is still read for back-compat).
 */
import { mkdir, readFile, readdir, rename, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { randomBytes } from "node:crypto";

import { SEED_REGISTRY } from "../registry/seed.js";
import * as logic from "../registry/registry-logic.js";
import type {
  RegistryAgentRecord,
  RegistryFile,
  RegistrySkillRecord,
  RegistryWorkflowRecord,
  ResolveAgentResponse,
} from "../registry/types.js";
import { AsyncLock } from "./memory-store.js";
import type {
  DelegationRecord,
  PublishSkillInput,
  PublishWorkflowInput,
  RegisterAgentInput,
  RegistryStore,
  RunsStore,
  WorkflowRunRecord,
} from "./types.js";

/** Write `contents` to `target` atomically (temp file + rename). */
async function atomicWrite(target: string, contents: string): Promise<void> {
  await mkdir(dirname(target), { recursive: true });
  const tmp = `${target}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  await writeFile(tmp, contents, "utf8");
  // rename is atomic on the same filesystem; the temp file sits next to target
  // so they share one. A failed write leaves the previous target untouched.
  await rename(tmp, target);
}

// One lock per absolute file path, shared process-wide, so all stores pointing
// at the same registry file serialize their load→mutate→save against it.
const registryLocks = new Map<string, AsyncLock>();
function lockFor(path: string): AsyncLock {
  let lock = registryLocks.get(path);
  if (!lock) {
    lock = new AsyncLock();
    registryLocks.set(path, lock);
  }
  return lock;
}

export interface FileRegistryStoreOptions {
  /**
   * Document used when the file does not yet exist. Defaults to the bundled
   * SEED_REGISTRY (matching LocalRegistry). Pass an empty registry for a
   * pristine store.
   */
  seed?: RegistryFile;
}

export class FileRegistryStore implements RegistryStore {
  #path: string;
  #seed: RegistryFile;

  constructor(filePath: string, options: FileRegistryStoreOptions = {}) {
    this.#path = filePath;
    this.#seed = options.seed ?? SEED_REGISTRY;
  }

  get filePath(): string {
    return this.#path;
  }

  async #load(): Promise<RegistryFile> {
    let raw: string;
    try {
      raw = await readFile(this.#path, "utf8");
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        return structuredClone(this.#seed);
      }
      throw err;
    }
    const parsed = JSON.parse(raw) as RegistryFile;
    if (parsed.version !== 1) {
      throw new Error(
        `Unsupported registry version: ${String((parsed as { version?: unknown }).version)}`,
      );
    }
    return parsed;
  }

  async #persist(data: RegistryFile): Promise<void> {
    await atomicWrite(this.#path, `${JSON.stringify(data, null, 2)}\n`);
  }

  /**
   * Run a mutation under the per-file lock: load the freshest document, apply,
   * persist only if something changed. Re-loading inside the lock is what makes
   * concurrent mutations safe — each one sees the previous one's committed
   * write rather than a stale snapshot.
   */
  #mutate<T>(fn: (data: RegistryFile) => logic.MutationResult<T>): Promise<T> {
    return lockFor(this.#path).run(async () => {
      const data = await this.#load();
      const { value, changed } = fn(data);
      if (changed) await this.#persist(data);
      return value;
    });
  }

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
    return logic.searchAgents(await this.#load(), query, limit);
  }

  async listMemoryNamespaces(agentName: string): Promise<string[]> {
    return logic.listMemoryNamespaces(await this.#load(), agentName);
  }

  async listDelegations(agentName: string): Promise<DelegationRecord[]> {
    return logic.listDelegations(await this.#load(), agentName);
  }

  registerAgent(input: RegisterAgentInput): Promise<RegistryAgentRecord> {
    return this.#mutate((data) => logic.registerAgent(data, input));
  }

  removeAgent(name: string): Promise<RegistryAgentRecord> {
    return this.#mutate((data) => logic.removeAgent(data, name));
  }

  publishSkill(input: PublishSkillInput): Promise<RegistrySkillRecord> {
    return this.#mutate((data) => logic.publishSkill(data, input));
  }

  async getWorkflows(): Promise<RegistryWorkflowRecord[]> {
    return logic.getWorkflows(await this.#load());
  }

  async listWorkflows(agentName: string): Promise<RegistryWorkflowRecord[]> {
    return logic.listWorkflows(await this.#load(), agentName);
  }

  async findWorkflowBySlug(
    slug: string,
  ): Promise<RegistryWorkflowRecord | undefined> {
    return logic.findWorkflowBySlug(await this.#load(), slug);
  }

  publishWorkflow(
    input: PublishWorkflowInput,
  ): Promise<RegistryWorkflowRecord> {
    return this.#mutate((data) => logic.publishWorkflow(data, input));
  }

  recordMemoryNamespace(
    agentName: string,
    namespace: string,
  ): Promise<string[]> {
    return this.#mutate((data) =>
      logic.recordMemoryNamespace(data, agentName, namespace),
    );
  }

  addDelegation(
    agentName: string,
    delegation: DelegationRecord,
  ): Promise<void> {
    return this.#mutate((data) =>
      logic.addDelegation(data, agentName, delegation),
    );
  }
}

export interface FileRunsStoreOptions {
  /**
   * Legacy single-file path (`runs.json`) read for back-compat. New appends are
   * written as per-run files into `<dir>/` (the directory containing this file
   * by default), so the read-modify-write race is gone. When omitted, only the
   * directory is used.
   */
  legacyFile?: string;
}

/**
 * Runs store that writes ONE FILE PER RUN into a directory, eliminating the
 * appendRun read-modify-write race. Listing reads every `*.json` in the dir
 * (plus an optional legacy `runs.json` for records written by the old store).
 */
export class FileRunsStore implements RunsStore {
  #dir: string;
  #legacyFile?: string;

  constructor(dir: string, options: FileRunsStoreOptions = {}) {
    this.#dir = dir;
    this.#legacyFile = options.legacyFile;
  }

  get dir(): string {
    return this.#dir;
  }

  #runPath(runId: string): string {
    // runId is host-generated; sanitize defensively so it stays one flat file.
    const safe = runId.replace(/[^a-zA-Z0-9._-]/g, "_");
    return join(this.#dir, `${safe}.json`);
  }

  async appendRun(run: WorkflowRunRecord): Promise<WorkflowRunRecord> {
    // A single atomic create per run — concurrent appends touch different files
    // and therefore cannot lose each other's records. No load step at all.
    await atomicWrite(
      this.#runPath(run.runId),
      `${JSON.stringify(run, null, 2)}\n`,
    );
    return run;
  }

  async #loadAll(): Promise<WorkflowRunRecord[]> {
    const runs: WorkflowRunRecord[] = [];

    // Per-run files (the durable, race-free source).
    let entries: string[] = [];
    try {
      entries = await readdir(this.#dir);
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
    }
    for (const entry of entries) {
      if (!entry.endsWith(".json")) continue;
      try {
        const raw = await readFile(join(this.#dir, entry), "utf8");
        runs.push(JSON.parse(raw) as WorkflowRunRecord);
      } catch {
        // Skip a corrupt/partial file rather than failing the whole list.
      }
    }

    // Legacy single-file (records written by the old runs-store.ts).
    if (this.#legacyFile && existsSync(this.#legacyFile)) {
      try {
        const raw = await readFile(this.#legacyFile, "utf8");
        const parsed = JSON.parse(raw) as { runs?: WorkflowRunRecord[] };
        if (Array.isArray(parsed.runs)) {
          const seen = new Set(runs.map((r) => r.runId));
          for (const r of parsed.runs) {
            if (!seen.has(r.runId)) runs.push(r);
          }
        }
      } catch {
        // Ignore a malformed legacy file.
      }
    }

    return runs;
  }

  async listRuns(agentSlug: string): Promise<WorkflowRunRecord[]> {
    const runs = await this.#loadAll();
    return runs
      .filter((r) => r.agentSlug === agentSlug)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  async getRun(runId: string): Promise<WorkflowRunRecord | undefined> {
    // Fast path: the per-run file.
    try {
      const raw = await readFile(this.#runPath(runId), "utf8");
      return JSON.parse(raw) as WorkflowRunRecord;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        // Corrupt file: fall through to the slow path.
      }
    }
    const runs = await this.#loadAll();
    return runs.find((r) => r.runId === runId);
  }
}
