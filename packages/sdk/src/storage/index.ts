/**
 * Async, pluggable storage layer (Node-only). Exported from `@agentos/sdk/node`.
 *
 * - Interfaces: {@link RegistryStore}, {@link RunsStore} — the contract route
 *   code depends on, so a real DB can slot in later without route changes.
 * - File impls: {@link FileRegistryStore}, {@link FileRunsStore} — atomic,
 *   concurrency-safe (fixes the appendRun data-loss race).
 * - In-memory impls: {@link InMemoryRegistryStore}, {@link InMemoryRunsStore}
 *   — for tests and serverless ephemeral fallback.
 * - Factory: default path resolution (env + Vercel /tmp) + store construction.
 */
export type {
  RegistryStore,
  RunsStore,
  WorkflowRunRecord,
  DelegationRecord,
  PublishSkillInput,
  RegisterAgentInput,
  RegistryAgentRecord,
  RegistryFile,
  RegistrySkillRecord,
  ResolveAgentResponse,
} from "./types.js";

export {
  AsyncLock,
  InMemoryRegistryStore,
  InMemoryRunsStore,
} from "./memory-store.js";

export {
  FileRegistryStore,
  FileRunsStore,
} from "./file-store.js";
export type {
  FileRegistryStoreOptions,
  FileRunsStoreOptions,
} from "./file-store.js";

export {
  createDefaultRegistryStore,
  createDefaultRunsStore,
  resolveRegistryStorePath,
  resolveRunsDir,
} from "./factory.js";
export type {
  DefaultStoreOptions,
  CreateDefaultRegistryStoreOptions,
  CreateDefaultRunsStoreOptions,
} from "./factory.js";

// Reference SQL adapter (sketch — no live connection). The shape a real DB
// backend (Vercel Postgres / Cloudflare D1 / Turso) implements so it can slot in
// behind STORAGE_BACKEND without changing any route. See docs/storage-adapter.md.
export {
  SQL_SCHEMA,
  SqlRegistryStore,
  SqlRunsStore,
  createSqlStores,
  createPostgresStores,
  createD1Stores,
} from "./sql-store.js";
export type {
  SqlDatabase,
  SqlResult,
  SqlRow,
  SqlStores,
} from "./sql-store.js";
