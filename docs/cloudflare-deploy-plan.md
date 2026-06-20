# Deploy `packages/frontend` to Cloudflare Workers — decision-ready plan

Status: RESEARCH + PLAN ONLY. No Cloudflare mutation, no `wrangler login`/`deploy`, no app
source edited in this pass. Grounded in official Cloudflare docs (cited inline).

---

## 1. Recommendation + rationale

**HYBRID / staged — and read this honest tradeoff first.**

Cloudflare Workers will **not** meaningfully speed up this app's hot paths. Every heavy API
route (`transaction/sponsor`, `transaction/execute-sponsored`, `workflows/[slug]/run`,
`skills/upload`, `skills/blob-status`) awaits **centralized HTTP origins**: the Sui testnet
fullnode RPC, the Walrus publisher/aggregator, Enoki, Harbor, and memwal. Edge proximity to
the browser cannot speed up a single-region origin — the Worker is just one extra hop in
front of the same backends. The routes that *do* benefit from the edge (the `resolve` /
`agents` / `skills` reads) are exactly the ones that today read a local JSON file and on
Workers become a D1 binding round-trip.

The real, defensible Workers payoffs are:
1. Fixing the persistence bug **properly** (today both the Vercel `/tmp` fallback and a
   Workers fs write are ephemeral and silently lose writes). *Note: this fix is
   platform-neutral — Vercel can do it too via Vercel KV/Postgres. Only the integrated
   binding ergonomics are Workers-specific.*
2. Cheap global static-asset + SSR-shell delivery, with no per-function tax on KV/D1.

What is **not** a meaningful win for this app: isolate cold starts (~ms) are in the noise
next to the multi-second Sui/Walrus/Enoki round-trips that dominate every hot route.

### Decision matrix

| If the user's goal is…                                     | Do this                                                                                   |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| "faster Sui API calls"                                     | **STAY ON VERCEL.** The migration will not deliver it. Fix durability with Vercel KV/Postgres. |
| Cloudflare infra/cost/global-static + durable persistence, and willing to fund the storage refactor | **Go WORKERS** via `@opennextjs/cloudflare` on the **Workers Paid** plan.                  |
| Cloudflare Pages / `@cloudflare/next-on-pages`             | **REJECT.** Its Edge-only runtime bans `node:fs`/`node:crypto`/`Buffer`, breaking `@agentos/sdk/node` (LocalRegistry, manifest hashing) and `lib/sponsored-execute.ts` (`Ed25519Keypair`, `decodeSuiPrivateKey`, `Buffer`). It is also Cloudflare's de-emphasized full-stack track. |

**Net:** Workers is feasible and is the correct Cloudflare path *if* chosen, but it is an
infra/durability project (~1–2 weeks), **not** a speed quick-win. The gating prerequisite is
the fs→D1 storage refactor; without it, create-agent / publish-skill / run-record writes
silently vanish on Workers (`node:fs` is ephemeral per-request — confirmed below).

---

## 2. Adapter + setup

**Adapter: `@opennextjs/cloudflare` (OpenNext Workers adapter), pin ≥ v1.3.0** (earlier
versions had the `/_next/image` SSRF CVE GHSA-rvpw-p7vw-wj3m). This is Cloudflare's officially
documented Next.js-on-Workers adapter
(<https://developers.cloudflare.com/workers/framework-guides/web-apps/nextjs/>). It runs the
**Node.js runtime on `workerd`**, so the app's `node:fs` / `node:crypto` / `Buffer` + `@mysten/*`
usage loads — unlike Pages/next-on-pages (Edge runtime) which bans them.

Fit check against this repo:
- Next 15 App Router + Route Handlers: supported.
- The only unsupported Next feature (Node.js middleware, Next 15.2) is a **non-issue** —
  the frontend has **no `middleware.ts`** and **no `export const runtime` pins** (verified).
- `app/agent/[name]/opengraph-image.tsx` uses `next/og` (`ImageResponse`/Satori) — this **is**
  supported on the OpenNext Node runtime, but it pulls `@vercel/og` + a ~1.4 MiB `resvg.wasm`
  into the worker bundle, on top of the already-large `@mysten/*` set. It is a concrete,
  un-counted contributor to the bundle-size risk (see §7) and must be measured. It also calls
  `resolveAgentPageData`, so it depends on the same fs→D1 read-path migration.

### Setup commands (run by the user under their own Cloudflare account)

```bash
# from packages/frontend
pnpm add -D @opennextjs/cloudflare wrangler

# open-next.config.ts (project root of packages/frontend):
#   import { defineCloudflareConfig } from "@opennextjs/cloudflare";
#   export default defineCloudflareConfig();

# next.config.ts: set outputFileTracingRoot to the MONOREPO ROOT so Next standalone
# output traces the @agentos/sdk workspace package (known pnpm/turbo trap).

# package.json scripts:
#   "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
#   "deploy":  "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
#   "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"

opennextjs-cloudflare build     # emits .open-next/worker.js + .open-next/assets
opennextjs-cloudflare preview   # REAL workerd validation — MUST run before trusting
                                # @mysten/seal (BLS/WASM) + @mysten/walrus (WASM) + resvg.wasm
opennextjs-cloudflare deploy    # USER ACTION — needs wrangler login (see Blockers)
```

**Plan requires Workers Paid.** Free plan caps external subrequests at 50 and script size at
3 MiB compressed; paid gives 10 MiB script and a 10,000-subrequest default (configurable up to
10M), plus `cpu_ms` up to 300,000 (5 min). Paid is needed for the **CPU/script-size** reasons —
*not* because the workflow fan-out (Trigger → Walrus → {Harbor, Sui} → memory = a handful of
subrequests) is anywhere near the 10k ceiling.
(Sources: <https://developers.cloudflare.com/changelog/post/2026-02-11-subrequests-limit/>,
<https://developers.cloudflare.com/workers/wrangler/configuration/>.)

Reject `next-on-pages`/Pages and a hand-rolled plain Worker (would reimplement Next
routing/SSR).

---

## 3. Storage migration — the gating work

`node:fs` exists on `workerd` under `nodejs_compat` but is **ephemeral**: "The virtual file
system is ephemeral with each individual request having its own isolated temporary file space.
Files written to the file system will not persist across requests and will not be shared across
requests." (Official CF changelog, 2025-08-15:
<https://developers.cloudflare.com/changelog/post/2025-08-15-nodejs-fs/>.) So today's fs writes
silently vanish on Workers. **Recommendation: one D1 database for both stores** (single binding,
one consistency model, read-after-write consistency for the register-then-immediately-list
dashboard flow).

| Store (repo) | Target | Why |
| --- | --- | --- |
| `.agentos/registry.json` — `lib/registry-server.ts` → `@agentos/sdk` `LocalRegistry`; mostly-read JSON (`agents[]`+`skills[]`); queried by slug/suins, `listSkills`-by-agent, fuzzy `searchAgents`, `removeAgent` cascade | **Cloudflare D1** (PRIMARY), tables `agents`/`skills`/`delegations`; binding `AGENTOS_DB` | The code does cross-record queries (`findAgentBySuins`, `listSkills` by agentSlug, fuzzy `searchAgents`, `removeAgent` cascade-to-skills) and needs **read-after-write** consistency for register-then-list. KV is eventually-consistent (up to ~60 s global propagation, last-write-wins, no transactions) → stale reads after register/publish. R2 is wrong (blob store, no query). A global Durable Object would serialize all reads through one location — overkill for a low-write registry. KV-single-blob is acceptable only as a least-effort stopgap. |
| `.agentos/runs.json` — `lib/runs-store.ts`; append-heavy run log. `appendRun` does whole-file load→push→save = a real **read-modify-write data-loss race** (already broken on Vercel `/tmp`); polled by `runId`, listed by `agentSlug` newest-first | **Cloudflare D1** (same DB), `runs` table: `runId TEXT PRIMARY KEY, agentSlug TEXT, createdAt TEXT (indexed), status TEXT, steps TEXT (JSON)` | Each `appendRun` becomes one `INSERT` (eliminates the race and the per-append whole-file rewrite); `listRuns` = `SELECT WHERE agentSlug ORDER BY createdAt DESC` (the index preserves the existing `localeCompare(createdAt)` ordering); `getRun` = `SELECT WHERE runId`. KV is a poor fit (eventual consistency, ~1 write/sec/key guidance, prefix-only list). |
| `.agentos/config.json` + homedir/cwd reads — `@agentos/sdk` `config.ts` (`loadConfig`/`resolveRegistryPath` via `node:fs`/`os`/`path`) | Worker `[vars]`/secrets (no store) | No cwd/config file or homedir on Workers. `config.ts mergeConfigEnv` already reads `AGENTOS_PACKAGE_ID`/`SUI_RPC_URL`/`HARBOR_API_KEY` from `process.env`; guard the file-read branch to no-op when no FS is available and build `AgentOSConfig` purely from Worker vars. |
| `node:crypto` `createHash`/`randomUUID` in shared SDK (`manifest.ts`, `seal.ts`, `local-registry.ts`) + `sponsored-execute.ts` | Native WebCrypto / `crypto.getRandomValues` (or keep `node:crypto` under `nodejs_compat`) | `node:crypto` works fully under `nodejs_compat`, so this is **optional**. Swapping the shared `LocalRegistry` helpers to WebCrypto keeps the extracted pure helpers runtime-agnostic for both the Node fs impl and the workerd D1 impl. |
| Walrus/Harbor manifest blobs | NO migration — already external `fetch` HTTP | Blobs never touch local disk; all blob storage is fetch-based and works unchanged. (Optional later: KV/Cache-API caching keyed on the content-addressed SHA-256 manifest hash on the `force-dynamic` resolve/list routes — the only real read-path latency win.) |

### Adapter interface (the refactor's shape)

Add **async** `RegistryStore` / `RunsStore` interfaces in `@agentos/sdk`, then provide two impls
behind a factory. **Keep the existing sync fs `LocalRegistry` intact** (do not rewrite it in
place) and **add a parallel D1-backed impl**:

```ts
// @agentos/sdk — new async store contracts
export interface RegistryStore {
  getAgentBySlug(slug: string): Promise<AgentRecord | undefined>;
  findAgentBySuins(suins: string): Promise<AgentRecord | undefined>;
  searchAgents(query: string): Promise<AgentRecord[]>;
  listSkills(agentSlug: string): Promise<SkillRecord[]>;
  putAgent(a: AgentRecord): Promise<void>;
  putSkill(s: SkillRecord): Promise<void>;
  removeAgent(slug: string): Promise<void>; // cascade to skills/delegations
}
export interface RunsStore {
  appendRun(run: WorkflowRunRecord): Promise<WorkflowRunRecord>; // single INSERT, no RMW race
  listRuns(agentSlug: string): Promise<WorkflowRunRecord[]>;     // ORDER BY createdAt DESC
  getRun(runId: string): Promise<WorkflowRunRecord | undefined>;
}

// factory: D1 adapter when getCloudflareContext().env.AGENTOS_DB is present,
// else the existing fs LocalRegistry (CLI / MCP / local dev unchanged).
```

`lib/registry-server.ts`, `lib/runs-store.ts`, `lib/registry-resolve.ts`, and
`lib/sponsored-execute.ts` become factories selecting the impl by binding presence. The ~18 API
route handlers + the OG route then `await` the now-async store methods (sync→async ripple is the
main mechanical risk — see Blockers). Access D1/KV via `getCloudflareContext().env`, **not**
`process.env`.

### Operational consequence you MUST surface to the user

The parallel-surface design **forks the registry into two datastores.** Today the CLI, MCP
server, and frontend API routes literally share **one** file (`.agentos/registry.json`) — the
project's stated single-source-of-truth invariant. After cutover:

- The deployed app's source of truth is **D1**.
- The CLI/MCP on the user's laptop stay on the local fs file.
- → An agent created via CLI will **not** appear in the deployed dashboard, and vice-versa.

The Phase 3 seed from `.agentos/registry.json` is therefore a **one-time SNAPSHOT, not an
ongoing sync**. If the user wants CLI-published skills to show in the live dashboard, the
CLI/MCP must *also* be pointed at D1 (a thin HTTP client or a remote-D1 `@agentos/sdk` path) —
**additional scope** the user must decide on.

---

## 4. Secrets / vars / bindings

| Kind | Names | Mechanism |
| --- | --- | --- |
| **Secret** (never in config, never printed) | `ENOKI_SECRET_KEY`, `SUI_PRIVATE_KEY`, `HARBOR_API_KEY`, `MEMWAL_API_KEY` | `wrangler secret put <NAME>` (USER action) |
| **Var** (`[vars]`) | `AGENTOS_PACKAGE_ID`, `SUI_RPC_URL`, `HARBOR_BASE_URL`, `HARBOR_SPACE_ID`, `HARBOR_BUCKET_ID`, `MEMWAL_RELAYER_URL`, `NEXT_PUBLIC_SUI_NETWORK` | `wrangler.jsonc` `vars` |
| **Build variable** (inlined into the client bundle at build time) | all `NEXT_PUBLIC_*`: `NEXT_PUBLIC_ENOKI_API_KEY`, `NEXT_PUBLIC_ENOKI_SPONSOR`, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`, `NEXT_PUBLIC_SUI_NETWORK`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_AGENTOS_PACKAGE_ID` | Workers Builds "Build variables and secrets". Setting them only as runtime vars leaves the browser bundle empty. |
| **Binding** | `AGENTOS_DB` (`d1_databases`) — single DB: agents/skills/delegations/runs | `wrangler.jsonc` |
| **Binding** | `ASSETS` (`assets`) → `.open-next/assets` | `wrangler.jsonc` |
| **Binding (optional)** | `REGISTRY` (`kv_namespaces`) — only if you keep the KV stopgap, or for OpenNext incremental cache / hot read-cache | `wrangler.jsonc` |
| **Drop on Workers** | `AGENTOS_REGISTRY_PATH`, `AGENTOS_RUNS_PATH`, `VERCEL` / `/tmp` fallbacks | remove from the Workers code path (dead code there) |

**Process-env compatibility:** add the `nodejs_compat_populate_process_env` compatibility flag so
the existing `process.env.X` reads in `sponsored-execute.ts` and `config.ts` resolve from Worker
vars/secrets with **zero code change** for those reads. (Bindings like `AGENTOS_DB` must still be
read via `getCloudflareContext().env`.)

**Global mutable state note (best-practice, not a blocker):** `sponsored-execute.ts` caches
`cachedKeypair`/`cachedSuiClient` in module scope. Workers reuse isolates across requests, so
module-level singletons are shared cross-request. For a **single global signer** this is benign.
If signing ever becomes per-tenant, move the caches into per-request `getCloudflareContext().env`
context — flag as a constraint, no change needed now.

---

## 5. Wrangler config sketch

A ready sample lives at
`docs/cloudflare/wrangler.frontend.sample.jsonc` (reconciled to the all-D1 recommendation;
placeholders only, no secrets). Cloudflare's tooling prefers `wrangler.jsonc`; the equivalent
`wrangler.toml` is shown here as requested.

```toml
# packages/frontend/wrangler.toml  (SAMPLE — placeholders only, no secrets)
name = "suins-agentos-frontend"
main = ".open-next/worker.js"

# node:fs auto-resolves at 2025-09-01+ with nodejs_compat (else add enable_nodejs_fs_module).
# nodejs_compat is mandatory for @agentos/sdk/node + sponsored-execute (@mysten/*, Buffer, node:crypto).
# nodejs_compat_populate_process_env lets existing process.env.X reads resolve from vars/secrets.
compatibility_date = "2026-06-05"
compatibility_flags = ["nodejs_compat", "nodejs_compat_populate_process_env"]

[assets]
directory = ".open-next/assets"
binding = "ASSETS"

[observability]
enabled = true

# Paid plan. cpu_ms guards long Enoki sponsored-tx polls; subrequests default (10k) is plenty.
[limits]
cpu_ms = 60000

# ONE D1 DB for BOTH stores: agents/skills/delegations + runs tables.
[[d1_databases]]
binding = "AGENTOS_DB"
database_name = "agentos"
database_id = "<REPLACE_WITH_D1_DATABASE_ID>"

# OPTIONAL KV — only if you keep the registry as a KV stopgap, or for OpenNext incremental cache.
# [[kv_namespaces]]
# binding = "REGISTRY"
# id = "<REPLACE_WITH_KV_NAMESPACE_ID>"

[vars]
NEXT_PUBLIC_SUI_NETWORK = "testnet"
# AGENTOS_PACKAGE_ID = "0x..."
# SUI_RPC_URL = "https://fullnode.testnet.sui.io"
# HARBOR_BASE_URL = "https://..."
# HARBOR_SPACE_ID = "..."
# HARBOR_BUCKET_ID = "default"
# MEMWAL_RELAYER_URL = "https://..."

# Secrets via `wrangler secret put`: ENOKI_SECRET_KEY, SUI_PRIVATE_KEY, HARBOR_API_KEY, MEMWAL_API_KEY (NEVER here)
# NEXT_PUBLIC_* are build-time inlined -> set as Workers Builds Build variables, not runtime vars.
```

```ts
// open-next.config.ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
export default defineCloudflareConfig();
```

---

## 6. Phased rollout

- **Phase 0 — DECISION GATE (user, ~0 effort).** Confirm WHY. If the goal is faster Sui
  latency → stop, stay on Vercel; fix persistence with Vercel KV/Postgres. If the goal is
  Cloudflare infra/cost/global-static + durable persistence → proceed. User must create/auth
  their **own** Cloudflare account and enable Workers Paid.
- **Phase 1 — SCAFFOLD ADAPTER (~0.5 day, no app-logic change).** Add `@opennextjs/cloudflare`
  + `wrangler`; add `open-next.config.ts`; set `outputFileTracingRoot` to the monorepo root; copy
  the sample wrangler config to `packages/frontend/wrangler.jsonc`; run
  `opennextjs-cloudflare build` and **MEASURE the gzipped worker** against the 10 MiB paid cap —
  explicitly include the OG route's `resvg.wasm` and the `@mysten/*` + `@xyflow/react` weight in
  the audit; run `opennextjs-cloudflare preview` to confirm `@mysten/seal` (BLS/WASM),
  `@mysten/walrus` (WASM), **and `resvg.wasm`** actually initialize on real `workerd`.
- **Phase 2 — STORAGE ADAPTER REFACTOR (~3–5 days, GATING; edits app source — OUT OF SCOPE for
  this research pass).** Define async `RegistryStore`/`RunsStore` in `@agentos/sdk`; extract pure
  helpers (`normalizeSuinsName`, `slugFromSuins`, `searchAgents` scoring) from `LocalRegistry` and
  swap `node:crypto`→WebCrypto; KEEP the sync fs `LocalRegistry` for Node and ADD a parallel
  D1-backed impl; write D1 schema + migrations (agents, skills, delegations, runs); make
  `registry-server.ts` / `runs-store.ts` / `registry-resolve.ts` / `sponsored-execute.ts`
  factories selecting by `getCloudflareContext().env.AGENTOS_DB`; convert the ~18 consumer routes
  + the OG route to `await` the async store; guard `config.ts` fs reads to no-op on Workers.
- **Phase 3 — SECRETS + BINDINGS + SEED (~0.5 day; USER-authed wrangler commands).**
  `wrangler d1 create agentos` and paste the real `database_id`; seed D1 **once** from
  `.agentos/registry.json` via `wrangler d1 execute` (replacing the `BUNDLED_REGISTRY` → `/tmp`
  trick); `wrangler secret put` the four secrets; set `[vars]`; set all `NEXT_PUBLIC_*` as Workers
  Builds Build variables.
- **Phase 4 — PREVIEW DEPLOY (~0.5 day).** Deploy to a `workers.dev`/preview subdomain;
  smoke-test the full matrix — create agent, publish/import skill, resolve, search, run a workflow
  (verify the Sui+Walrus+Enoki+Harbor+memwal fan-out stays under limits), Enoki sponsored-tx path,
  OG image render, and **CONFIRM writes PERSIST across requests** (the whole point of the D1
  migration); check observability/logs.
- **Phase 5 — CUTOVER (~0.5 day).** Wire Workers Builds CI from the monorepo root; optional custom
  domain; run Vercel and Workers in parallel briefly, compare TTFB/error rates honestly, then flip
  DNS. Optional follow-up: KV/Cache-API caching keyed on the SHA-256 manifest hash for the
  `force-dynamic` resolve/list routes.

---

## 7. Blockers

> **USER actions — this workflow ran NONE of these (no CF mutation by design):**
> `wrangler login`, `wrangler d1 create agentos`, `wrangler kv namespace create REGISTRY`
> (if used), `wrangler secret put` × 4 (`ENOKI_SECRET_KEY`, `SUI_PRIVATE_KEY`, `HARBOR_API_KEY`,
> `MEMWAL_API_KEY`), `wrangler d1 execute` (seed), `opennextjs-cloudflare deploy`. All require the
> user's own authed Cloudflare account on the **Paid** plan.

1. **CF account auth (external, user-only).** Create/own the account, enable Workers Paid, run
   `wrangler login`, create the D1 DB.
2. **Workers Paid plan required.** Free plan's 50-external-subrequest cap and 3 MiB script cap are
   too small for the `@mysten` SDKs; paid gives 10 MiB + 10k subrequests. (Needed for
   CPU/script-size, not because the fan-out nears the subrequest ceiling.)
3. **Storage refactor is GATING (not optional).** Without moving `registry.json` + `runs.json`
   off `node:fs` to D1, create-agent / publish-skill / run-record writes silently vanish
   (workerd fs is ephemeral per-request — CF changelog 2025-08-15). App-source work (~3–5 days),
   intentionally NOT done in this research pass.
4. **Sync→async ripple.** `LocalRegistry.save()` and the runs-store load/save are synchronous;
   D1 bindings are async-only, so every store method becomes `Promise`-returning and ~18 routes +
   4 libs + the OG route must add `await`. Mechanical but wide-reaching; mitigate by adding the D1
   impl as a NEW parallel surface, leaving the Node fs `LocalRegistry` untouched.
5. **Registry fork / data divergence (behavior change — user must decide).** Post-cutover the
   deployed app's source of truth is D1; CLI/MCP stay on the local fs file. CLI-created agents will
   not appear in the live dashboard and vice-versa. Pointing CLI/MCP at D1 is additional scope.
6. **Bundle size unknown until first build.** `@mysten/*` (sui, enoki, walrus+WASM, seal, suins)
   + `@xyflow/react` + the OG route's `@vercel/og` + ~1.4 MiB `resvg.wasm` may push the gzipped
   worker over the 10 MiB paid cap. Measure after `opennextjs-cloudflare build`; if over,
   lazy-import the Mysten SDKs in the route handlers, ship a static OG image (or move OG to a
   separate Worker), or split a backend Worker via service binding.
7. **WASM runtime risk.** `@mysten/seal` (BLS/WASM), `@mysten/walrus` (WASM), and the OG
   `resvg.wasm` are expected to work under `nodejs_compat` but MUST be validated in
   `opennextjs-cloudflare preview` on real `workerd` before trusting the Harbor private-skill,
   Walrus, and OG paths.
8. **`compatibility_date` ≥ 2025-09-01** with `nodejs_compat` so `node:fs` auto-resolves (else add
   the `enable_nodejs_fs_module` flag), otherwise every route importing `@agentos/sdk/node` throws
   at module load.
9. **Honest-expectation blocker.** If the user's actual goal is "faster Sui calls," the migration
   does not deliver it (centralized origins). Set expectations before committing ~1–2 weeks.

---

## 8. Effort

**~1–2 weeks (6–9 dev-days)** for a correct Workers cutover, dominated by the storage refactor —
NOT a quick relocation.

- Phase 1 scaffold + build/preview + bundle audit: ~0.5 d
- Phase 2 storage adapter (interfaces + D1 schema/migrations + D1 impl + WebCrypto swap + make
  ~18 routes & 4 libs & OG route async): ~3–5 d (the bulk and the gating risk)
- Phase 3 secrets/bindings/seed: ~0.5 d
- Phase 4 preview smoke-test incl. `@mysten/seal`/`resvg` WASM + persistence verification: ~0.5 d
- Phase 5 CI + cutover: ~0.5 d
- Contingency for a bundle-size pivot (lazy-import / static OG / split Worker): +1–2 d if the
  gzipped worker exceeds 10 MiB.

This research/plan pass is DONE and required no app-source edits. Deliverables on disk:
- `docs/cloudflare-deploy-plan.md` (this file)
- `docs/cloudflare/wrangler.frontend.sample.jsonc` (reconciled to all-D1 + populate_process_env)

---

## 9. Risks

1. **Expectation risk (highest).** User wants "faster edge serving" but the
   Sui/Walrus/Enoki/Harbor/memwal round-trips that dominate API latency are centralized — Workers
   is neutral-to-slightly-worse on those paths. Wins are static/SSR-shell TTFB and durable
   persistence, not raw Sui-bound speed.
2. **Latent concurrency data-loss is ALREADY broken** (`runs-store.appendRun` whole-file
   read-modify-write race + ephemeral `/tmp`). The D1 migration fixes it; doing nothing leaves it
   broken on either platform.
3. **Monorepo build friction.** OpenNext standalone output references the `@agentos/sdk` workspace
   pkg; wrong `outputFileTracingRoot`/build context breaks the build (pnpm/turbo trap).
4. **Bundle over 10 MiB** forces a mid-project pivot to lazy-imports / static OG / split backend
   Worker — effort not in the base estimate.
5. **Long Enoki sponsored-tx polls** (`tx.build` → Enoki create → sign → Enoki execute →
   `waitForTransaction`) are wall-clock-bound; under load could approach CPU/wall limits — consider
   Cloudflare Queues/Workflows later.
6. **Eventual-consistency trap** if the registry is put on the KV stopgap instead of D1:
   register-then-immediately-list shows stale data for up to ~60 s.
7. **Security (pre-existing, not Cloudflare-specific).** `/api/skills` POST is currently
   unauthenticated and mutates the registry; exposing it on a public edge endpoint amplifies the
   risk. Add a signature/auth check before public cutover.
8. **Dead-code hygiene.** The Vercel `/tmp` + `node:os` fallback branches become dead code on
   Workers and should be removed from the Workers code path to avoid confusion.
