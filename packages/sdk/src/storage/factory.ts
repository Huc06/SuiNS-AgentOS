/**
 * Default store construction + path resolution.
 *
 * This relocates the path logic that used to live in the frontend's
 * `lib/registry-server.ts` and `lib/runs-store.ts` (including the
 * `AGENTOS_REGISTRY_PATH` / `AGENTOS_RUNS_PATH` env overrides and the Vercel
 * `/tmp` fallback) into the SDK, so the frontend can simply ask for a store and
 * not re-implement filesystem placement.
 *
 * On a read-only serverless filesystem with no writable `/tmp`, callers can
 * fall back to the in-memory stores (see {@link createDefaultRegistryStore}'s
 * `inMemoryFallback` option).
 */
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { loadConfig, resolveRegistryPath } from "../config.js";
import type { RegistryFile } from "../registry/types.js";
import { FileRegistryStore, FileRunsStore } from "./file-store.js";
import {
  InMemoryRegistryStore,
  InMemoryRunsStore,
} from "./memory-store.js";
import type {
  RegistryStore,
  RunsStore,
  WorkflowRunRecord,
} from "./types.js";

export interface DefaultStoreOptions {
  /** Working dir to resolve `.agentos/*` from. Defaults to `process.cwd()`. */
  cwd?: string;
  /**
   * Repo root used to locate the shared `.agentos/registry.json` when running
   * from a package subdir (the frontend passes `<cwd>/../..`). Defaults to cwd.
   */
  repoRoot?: string;
  /**
   * On Vercel the only writable location is `/tmp`. When true (the default),
   * resolve paths under `os.tmpdir()` and seed them on first use. Detected from
   * `process.env.VERCEL` when not given.
   */
  vercel?: boolean;
  /**
   * Path to a bundled seed registry copied into `/tmp` on first request (the
   * frontend ships `registry.seed.json`). Used only in the Vercel branch.
   */
  bundledRegistry?: string;
}

/** Resolve the registry JSON path the same way for every surface. */
export function resolveRegistryStorePath(
  options: DefaultStoreOptions = {},
): string {
  const cwd = options.cwd ?? process.cwd();
  const onVercel = options.vercel ?? Boolean(process.env.VERCEL);

  if (process.env.AGENTOS_REGISTRY_PATH) {
    return process.env.AGENTOS_REGISTRY_PATH;
  }
  if (onVercel) {
    const registryPath = join(tmpdir(), ".agentos", "registry.json");
    ensureSeededRegistry(registryPath, options.bundledRegistry);
    return registryPath;
  }
  const config = loadConfig(cwd);
  const repoRoot = options.repoRoot ?? cwd;
  return resolveRegistryPath(config, repoRoot);
}

/** Resolve the runs directory (sibling of the registry file). */
export function resolveRunsDir(options: DefaultStoreOptions = {}): {
  dir: string;
  legacyFile?: string;
} {
  const onVercel = options.vercel ?? Boolean(process.env.VERCEL);

  if (process.env.AGENTOS_RUNS_PATH) {
    // Honor the historical single-file env var: treat its directory as the runs
    // dir and the file itself as the legacy back-compat file.
    const legacyFile = process.env.AGENTOS_RUNS_PATH;
    return { dir: join(dirname(legacyFile), "runs.d"), legacyFile };
  }
  if (onVercel) {
    const base = join(tmpdir(), ".agentos");
    return {
      dir: join(base, "runs.d"),
      legacyFile: join(base, "runs.json"),
    };
  }
  const registryPath = resolveRegistryStorePath(options);
  const base = dirname(registryPath);
  return { dir: join(base, "runs.d"), legacyFile: join(base, "runs.json") };
}

/**
 * Copy the bundled seed registry to `targetPath` on first use (Vercel cold
 * start), or write an empty registry so the store never crashes on a missing
 * file. Idempotent: a warm instance with the file already present is a no-op.
 */
function ensureSeededRegistry(
  targetPath: string,
  bundledRegistry?: string,
): void {
  if (existsSync(targetPath)) return;
  mkdirSync(dirname(targetPath), { recursive: true });
  if (bundledRegistry && existsSync(bundledRegistry)) {
    copyFileSync(bundledRegistry, targetPath);
  } else {
    const empty: RegistryFile = { version: 1, agents: [], skills: [] };
    writeFileSync(targetPath, `${JSON.stringify(empty, null, 2)}\n`, "utf8");
  }
}

/**
 * Shape of the bundled `runs.seed.json`: `{ version: 1, runs: [...] }`. Loaded
 * once at cold start so the Analytics dashboard is populated even on an
 * ephemeral filesystem (the demo runs are not user data — purely illustrative).
 */
interface RunsSeedFile {
  version?: number;
  runs?: WorkflowRunRecord[];
}

/** Read + parse a bundled runs-seed file. Returns [] on any error/missing. */
function loadSeedRuns(bundledRuns?: string): WorkflowRunRecord[] {
  if (!bundledRuns || !existsSync(bundledRuns)) return [];
  try {
    const parsed = JSON.parse(
      readFileSync(bundledRuns, "utf8"),
    ) as RunsSeedFile;
    return Array.isArray(parsed.runs) ? parsed.runs : [];
  } catch {
    return [];
  }
}

/**
 * On cold start (no per-run files AND no legacy runs file yet), write the
 * bundled demo runs into the runs dir as per-run files so listings/analytics see
 * them. Idempotent: once any run file exists the dir is considered seeded and
 * this is a no-op (so it never clobbers/duplicates real runs on a warm fs).
 */
function ensureSeededRuns(
  dir: string,
  legacyFile: string | undefined,
  seedRuns: WorkflowRunRecord[],
): void {
  if (seedRuns.length === 0) return;
  // Already has runs? (a populated dir, or a legacy file) → don't reseed.
  if (existsSync(dir)) {
    try {
      const hasRunFile = readdirSync(dir).some((f) => f.endsWith(".json"));
      if (hasRunFile) return;
    } catch {
      // Unreadable dir: fall through and attempt to seed; failures are ignored.
    }
  }
  if (legacyFile && existsSync(legacyFile)) return;

  try {
    mkdirSync(dir, { recursive: true });
    for (const run of seedRuns) {
      const safe = run.runId.replace(/[^a-zA-Z0-9._-]/g, "_");
      const target = join(dir, `${safe}.json`);
      if (existsSync(target)) continue;
      writeFileSync(target, `${JSON.stringify(run, null, 2)}\n`, "utf8");
    }
  } catch {
    // Read-only fs (no writable /tmp): seeding the file backend isn't possible.
    // The in-memory fallback path seeds from the same file instead.
  }
}

export interface CreateDefaultRegistryStoreOptions extends DefaultStoreOptions {
  /**
   * When the resolved filesystem location is not writable (no `/tmp`, fully
   * read-only fs), fall back to an ephemeral {@link InMemoryRegistryStore}
   * seeded from the bundled registry if readable. Defaults to false.
   */
  inMemoryFallback?: boolean;
}

/** Build the default registry store (file-backed, or in-memory fallback). */
export function createDefaultRegistryStore(
  options: CreateDefaultRegistryStoreOptions = {},
): RegistryStore {
  if (options.inMemoryFallback) {
    let seed: RegistryFile | undefined;
    if (options.bundledRegistry && existsSync(options.bundledRegistry)) {
      try {
        seed = JSON.parse(
          readFileSync(options.bundledRegistry, "utf8"),
        ) as RegistryFile;
      } catch {
        seed = undefined;
      }
    }
    return new InMemoryRegistryStore(seed);
  }
  const path = resolveRegistryStorePath(options);
  return new FileRegistryStore(path);
}

export interface CreateDefaultRunsStoreOptions extends DefaultStoreOptions {
  /** Use an ephemeral in-memory runs store instead of files. Defaults to false. */
  inMemoryFallback?: boolean;
  /**
   * Path to a bundled `runs.seed.json` (`{ version, runs }`). When provided and
   * the store has no runs yet (cold start), the demo runs are seeded so the
   * Analytics dashboard is populated out of the box — including on an ephemeral
   * serverless filesystem. Real runs are never overwritten (seeding is skipped
   * once any run exists). Mirrors the registry's `bundledRegistry` seeding.
   */
  bundledRuns?: string;
}

/** Build the default runs store (file-per-run, or in-memory fallback). */
export function createDefaultRunsStore(
  options: CreateDefaultRunsStoreOptions = {},
): RunsStore {
  const seedRuns = loadSeedRuns(options.bundledRuns);

  if (options.inMemoryFallback) {
    // The ephemeral store seeds directly from the bundled runs (the fs can't be
    // written), so Analytics still shows the demo data on a read-only fs.
    return new InMemoryRunsStore(seedRuns);
  }

  const { dir, legacyFile } = resolveRunsDir(options);
  // Cold start: materialize the demo runs as per-run files (idempotent — never
  // reseeds once real runs exist).
  ensureSeededRuns(dir, legacyFile, seedRuns);
  return new FileRunsStore(dir, legacyFile ? { legacyFile } : {});
}
