/**
 * Server-only: make the repo-root `.env` reach Next.js server routes WITHOUT
 * duplicating secrets.
 *
 * THE PROBLEM. `next dev` / `next build` / `next start` run with
 * cwd = packages/frontend, and Next only auto-loads `.env*` files from THAT
 * directory. The user keeps a single `.env` at the repo root
 * (SUI_PRIVATE_KEY, ENOKI_SECRET_KEY, MEMWAL_*, NEXT_PUBLIC_*). Next never
 * walks up, so `process.env.SUI_PRIVATE_KEY` is undefined in every server
 * route — the motivating "SUI_PRIVATE_KEY is not set" bug.
 *
 * THE FIX. Load the repo-root `.env` with dotenv, with `override: false` so any
 * real `packages/frontend/.env(.local)` Next already loaded still wins. dotenv
 * is already a root dependency — no new install. This is inert in production
 * hosting (Vercel) where the root `.env` is absent and platform env vars are
 * used instead.
 *
 * NEVER logs values — it only sets `process.env` keys that aren't already set.
 * Idempotent: a module-level guard means repeated imports cost nothing.
 *
 * This helper is the belt-and-suspenders companion to the same load in
 * `next.config.ts` (which covers every route). Importing it at the top of a
 * route guarantees the vars are present even if the config-time load was
 * skipped (tests, isolated module evaluation).
 */

import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";

let loaded = false;

/**
 * Load the repo-root `.env` into `process.env` (without overriding anything
 * already set). Safe to call many times.
 */
export function loadRootEnv(): void {
  if (loaded) return;
  loaded = true;

  // From packages/frontend (cwd of the Next process) the repo root is two
  // levels up. Also try one extra level in case cwd is the repo root already.
  const candidates = [
    resolve(process.cwd(), "../../.env"),
    resolve(process.cwd(), ".env"),
  ];

  for (const path of candidates) {
    if (existsSync(path)) {
      loadDotenv({ path, override: false });
    }
  }
}
