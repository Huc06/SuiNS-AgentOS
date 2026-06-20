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
import type { RegistryStore, RunsStore } from "./types.js";

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
}

/** Build the default runs store (file-per-run, or in-memory fallback). */
export function createDefaultRunsStore(
  options: CreateDefaultRunsStoreOptions = {},
): RunsStore {
  if (options.inMemoryFallback) {
    return new InMemoryRunsStore();
  }
  const { dir, legacyFile } = resolveRunsDir(options);
  return new FileRunsStore(dir, legacyFile ? { legacyFile } : {});
}
