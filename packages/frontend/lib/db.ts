import { neon } from "@neondatabase/serverless";
import { createPostgresStores, type RegistryStore, type RunsStore } from "@agentos-sui/sdk/node";

/**
 * Postgres-backed registry + runs storage (Neon serverless driver).
 *
 * Why this exists: on Vercel, `STORAGE_BACKEND=file` (the default) writes to
 * `/tmp`, which is PER-INSTANCE — Vercel routes concurrent requests to
 * different serverless instances with no shared filesystem, and any instance
 * can cold-start at any time (wiping `/tmp` back to the bundled seed). This
 * causes real, observed data loss: publishing a workflow, then navigating
 * away and back (or just a page refresh) can land on a different instance
 * that never saw the write, showing a stale/reseeded workflow or none at all.
 *
 * Postgres (Neon) is real shared state across every instance, so this bug
 * class is structurally impossible with this backend.
 *
 * Uses the Neon serverless driver's `.query(text, params)` — HTTP-based, no
 * connection pool to manage, safe to call fresh per request in a serverless
 * function (see neon.tech/docs/serverless/serverless-driver).
 */

let cachedStores: { registry: RegistryStore; runs: RunsStore } | undefined;

/**
 * Get the process-wide cached Postgres-backed stores. Throws if `DATABASE_URL`
 * (or `POSTGRES_URL`, the Vercel/Neon integration's historical env name) is
 * unset — callers should only reach this when `STORAGE_BACKEND=postgres`.
 */
export function getPostgresStores(): { registry: RegistryStore; runs: RunsStore } {
  if (cachedStores) return cachedStores;

  const connectionString =
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!connectionString) {
    throw new Error(
      "STORAGE_BACKEND=postgres requires DATABASE_URL (or POSTGRES_URL) to be set.",
    );
  }

  const sql = neon(connectionString);
  const stores = createPostgresStores((text, params) =>
    sql(text, params as unknown[], { fullResults: true }),
  );
  cachedStores = stores;
  return stores;
}
