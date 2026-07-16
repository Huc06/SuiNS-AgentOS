import { join } from "node:path";

import {
  createDefaultRegistryStore,
  resolveRegistryStorePath,
  type RegistryStore,
} from "@agentos-sui/sdk/node";

import { getPostgresStores } from "./db";

/**
 * Server-side registry access for the deployed app.
 *
 * The frontend talks ONLY to the async {@link RegistryStore} abstraction from
 * `@agentos-sui/sdk/node`, so a real database (D1 / Postgres / KV) can slot in later
 * by adding a new backend here WITHOUT touching any route code. By default the
 * store is file-backed (the same `.agentos/registry.json` the CLI and MCP server
 * read/write), preserving today's dev behavior.
 *
 * This is the frontend's intentional fork from the CLI/MCP surfaces: those keep
 * using the synchronous `LocalRegistry`; the deployed app uses this pluggable
 * async store so writes are durable and race-free (and a DB can replace files).
 */

/**
 * Path to the bundled read-only registry that ships with the build. Copied into
 * the frontend package at build time from the repo root `.agentos/registry.json`.
 * On Vercel, the SDK factory copies it to `/tmp` on first request so the
 * serverless function always has seed data.
 */
const BUNDLED_REGISTRY = join(process.cwd(), "registry.seed.json");

/**
 * Storage backend selector. `STORAGE_BACKEND` chooses the implementation:
 *   - "file"     (default) — file-backed {@link RegistryStore} (atomic, race-free)
 *   - "memory"             — ephemeral in-memory store (serverless read-only fs)
 *   - "postgres"           — Neon/Vercel Postgres, real shared state across every
 *                            serverless instance. See lib/db.ts and
 *                            docs/storage-adapter.md.
 * Future values ("d1", "kv") can be added here without changing any route —
 * they all consume the {@link RegistryStore} interface.
 */
type StorageBackend = "file" | "memory" | "postgres";

function selectedBackend(): StorageBackend {
  const raw = process.env.STORAGE_BACKEND?.trim().toLowerCase();
  if (raw === "memory") return "memory";
  if (raw === "postgres") return "postgres";
  return "file";
}

/**
 * Resolve options for the SDK store factory once. The frontend runs from a
 * package subdir, so the repo-root `.agentos/registry.json` lives two levels up.
 */
function storeOptions() {
  return {
    cwd: process.cwd(),
    repoRoot: join(process.cwd(), "../.."),
    bundledRegistry: BUNDLED_REGISTRY,
  };
}

/**
 * Resolve the registry JSON path the same way for every surface (the store
 * itself + any `AgentOSClient` constructed server-side), so they all read/write
 * the one shared `.agentos/registry.json` (or `/tmp` on Vercel). Honors
 * `AGENTOS_REGISTRY_PATH`. Used by the workflow run route to back its internal
 * (synchronous) `AgentOSClient` with the same file the store uses.
 */
export function getRegistryPath(): string {
  return resolveRegistryStorePath(storeOptions());
}

/**
 * Process-wide cached store. Caching matters for the in-memory backend (a fresh
 * instance per call would lose all writes) and avoids rebuilding the file store
 * — including the per-path async lock that serializes concurrent mutations — on
 * every request. Keyed by backend so a config flip during dev rebuilds it.
 */
let cached: { backend: StorageBackend; store: RegistryStore } | undefined;

/**
 * Get the shared async {@link RegistryStore}. Callers MUST `await` its methods.
 */
export function getRegistryStore(): RegistryStore {
  const backend = selectedBackend();
  if (cached && cached.backend === backend) {
    return cached.store;
  }
  if (backend === "postgres") {
    const store = getPostgresStores().registry;
    cached = { backend, store };
    return store;
  }
  const store = createDefaultRegistryStore({
    ...storeOptions(),
    inMemoryFallback: backend === "memory",
  });
  cached = { backend, store };
  return store;
}
