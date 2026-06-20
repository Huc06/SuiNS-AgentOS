# Deploying the SuiNS-AgentOS frontend to Cloudflare Workers — decision + plan

Status: RESEARCH + PLAN. No Cloudflare account mutation performed. The user must
auth their own account and run `wrangler` / Workers Builds themselves.

Scope: `packages/frontend` (Next.js 15 App Router). Sample config:
`packages/frontend/wrangler.sample.jsonc`.

---

## TL;DR recommendation

**Do NOT move to Workers right now for "faster edge serving".** The app is a thin
proxy in front of centralized backends (Sui testnet fullnode, Walrus
publisher/aggregator, Enoki sponsor, Harbor, memwal). Those round-trips dominate
latency and edge proximity does not speed them up — it can make them *worse* if
the Worker is far from those origins. The real cost of Workers here is the
**filesystem-store migration** (registry + runs JSON → D1/KV), which is a code
change to shared SDK/lib code the task explicitly told me not to edit in this
workflow.

Ranked:

1. **Stay on Vercel (recommended now).** Already wired (`process.env.VERCEL`
   `/tmp` fallbacks in `registry-server.ts` + `runs-store.ts`), Node runtime is
   native, zero migration. Caveat: `/tmp` is also ephemeral/per-instance — the
   current persistence story is already weak (fine for a demo, not multi-user).
2. **Cloudflare Workers via `@opennextjs/cloudflare` (best Cloudflare option, do
   it as a deliberate project, not a "just make it faster" toggle).** Pick this
   only if you also want to fix persistence properly (D1/KV) and want CF's edge
   for static/SSR + global anycast. Workers, not Pages — see below.
3. **Cloudflare Pages — do NOT pick.** Pages' Next adapter
   (`@cloudflare/next-on-pages`) is in maintenance; Cloudflare now steers all new
   Next.js work to Workers + OpenNext. Pages would mean the same fs migration
   with a worse-supported adapter.
4. **Hybrid (static/SSR on CF, API on Vercel).** Not worth the operational split
   for this app.

**Honest perf verdict:** Workers will NOT make the heavy Sui/Walrus/Enoki calls
faster. It can improve TTFB for static assets and cold-start behavior (Workers
isolates start in ~5ms vs Lambda cold starts), and gives global anycast routing.
If the goal is purely "faster", the win is marginal and centered on static
delivery, not the on-chain workflows the app actually spends time on.

---

## Why edge proximity does not help the hot paths

Every meaningful API route awaits a centralized HTTP backend:

| Route | Awaits | Located |
|---|---|---|
| `transaction/sponsor`, `execute-sponsored` | Enoki (`@mysten/enoki`) | Mysten infra (single region) |
| `workflows/[slug]/run` | Sui fullnode RPC + Walrus + memwal + Enoki | testnet fullnode / Walrus / memwal |
| `skills/upload`, `blob-status` | Walrus publisher/aggregator | Walrus network |
| `resolve`, `agents`, `skills` | local registry file (no network) | in-process fs |

The Worker becomes one more network hop *in front of* those origins. Unless the
Worker colocates with Mysten/Walrus (it won't), p50 latency is gated by those
backends, so "edge" buys nothing on the slow paths. The only routes edge could
speed up (`resolve`, `agents`, `skills` read paths) are exactly the ones that
today hit the local JSON file — and on Workers those must become D1/KV calls,
which adds a binding round-trip rather than removing one.

---

## HARD CONSTRAINT 1 — filesystem persistence (the blocker)

Workers have **no persistent writable filesystem**. `node:fs` IS now available on
workerd (changelog 2025-08-15), but the virtual FS is *ephemeral and per-request*
— "Files written to the file system will not persist across requests and will not
be shared across requests or across different Workers." So `node:fs` does NOT
rescue the current design; it only means the SDK's `import "node:fs"` won't fail
to load.

Affected files (all write JSON to disk via `node:fs`):

- `packages/frontend/lib/registry-server.ts` — resolves a path, opens
  `LocalRegistry` (read+write `.agentos/registry.json`).
- `packages/frontend/lib/runs-store.ts` — `appendRun` / `listRuns` / `getRun`
  read+write `.agentos/runs.json`.
- `packages/sdk/src/registry/local-registry.ts` — `LocalRegistry.save()` →
  `writeFileSync`; `loadFromDisk` → `readFileSync`. Mutations: `registerAgent`,
  `removeAgent`, `addDelegation`, `publishSkill`.
- `packages/sdk/src/config.ts` — `loadConfig` / `resolveRegistryPath` read config
  + probe files with `existsSync`/`readFileSync`.

### Store mapping

**`registry.json` → D1 (recommended)** — it is mostly-read, structured
(agents/skills/delegations), and queried by slug / suins / fuzzy search
(`searchAgents` does prefix/substring/subsequence matching). D1 (SQLite) gives
indexed reads and `LIKE` queries, and read-only queries auto-retry. A `KV`
fallback works only if you keep the whole-file-blob model (read the entire JSON,
mutate in memory, write the whole blob back) — simpler to port from
`LocalRegistry` but races under concurrent writes and has eventually-consistent
reads (KV writes can take up to ~60s to propagate globally). For a multi-user
dashboard, prefer D1.

**`runs.json` → KV or a D1 `runs` table** — append-heavy log, fetched by `runId`
(point lookup) and listed by `agentSlug`. KV with `key = runId` (+ an
`agent:<slug>:<ts>` index key, or a list prefix) is the simplest. If you already
stand up D1 for the registry, a `runs` table there avoids a second store and
gives ordered `WHERE agentSlug=? ORDER BY createdAt DESC` for free. Either is
fine; don't provision both.

### Migration effort (the real cost)

The clean approach is a storage interface so the SDK doesn't import `node:fs` on
Workers:

1. Extract a `RegistryStore` interface (the methods `LocalRegistry` exposes) and
   a `RunsStore` interface. Today both are concrete fs classes.
2. Add D1/KV implementations behind those interfaces (live in `packages/frontend`
   so the SDK stays storage-agnostic, OR add a `@agentos/sdk/cloudflare` entry).
3. Thread the Cloudflare bindings (`env.AGENTOS_DB`, `env.AGENTOS_RUNS`) from the
   Worker request context into the API routes. OpenNext exposes bindings via
   `getCloudflareContext()` from `@opennextjs/cloudflare` — routes currently grab
   stores via module-level helpers (`getRegistry()`), which must change to read
   bindings per-request.
4. A one-time seed: load `registry.seed.json` into D1 (a migration `.sql`).

Estimate: ~2–4 focused days. The riskier part is that `AgentOSClient`
(`workflows/run/route.ts`) is constructed with `registryPath: getRegistryPath()`
and reads the registry internally via the SDK's fs path — so the SDK itself, not
just the two frontend `lib/` files, needs a storage seam. That is why this is a
project, not a config tweak. (Out of scope for THIS workflow — flagged only.)

---

## HARD CONSTRAINT 2 — Node API usage on workerd

`@opennextjs/cloudflare` runs Next in `output: standalone` on workerd with the
Node.js compat layer. With `nodejs_compat` set:

| API / dep | On Workers? |
|---|---|
| `node:crypto` (`createHash`, `randomBytes`, `randomUUID`) | OK via nodejs_compat |
| `Buffer`, `process.env` | OK via nodejs_compat |
| `node:fs`, `node:os` (`tmpdir`, `homedir`), `node:path` | LOAD ok, but fs is ephemeral per-request (see Constraint 1) — must stop using for persistence |
| `@mysten/sui` (`Ed25519Keypair`, `decodeSuiPrivateKey`, `Transaction`, `SuiClient`) | OK — pure JS + WebCrypto-friendly; all RPC is `fetch` |
| `@mysten/enoki` (`EnokiClient`) | OK — `fetch`-based HTTP |
| `@mysten/walrus`, `@mysten/seal` | OK — `fetch`/WebCrypto based; verify the wasm/crypto deps build under workerd in `preview` (Seal uses BLS/wasm — TEST before trusting) |
| `zod` | OK |

The only hard break is the **filesystem persistence**, not the crypto/Buffer/
process surface. `@mysten/seal` is the one to validate in `wrangler dev`/preview
(wasm + BLS); everything else is fetch/WebCrypto and should run.

Also: OpenNext does **not** support `export const runtime = 'edge'` (it owns the
runtime) and Node.js middleware (Next 15.2+) is not yet supported. This repo
declares only `export const dynamic = 'force-dynamic'` (good — no `edge` runtime
declared anywhere) and has no `middleware.ts`, so this is fine.

---

## HARD CONSTRAINT 3 — secrets / env / bindings mapping

| Name | Type on Workers | Notes |
|---|---|---|
| `ENOKI_SECRET_KEY` | `wrangler secret put` | server-only; never expose |
| `SUI_PRIVATE_KEY` | `wrangler secret put` | runtime keypair for sponsored-execute |
| `HARBOR_API_KEY` | `wrangler secret put` | enables Seal/Harbor path |
| `MEMWAL_API_KEY`, `MEMWAL_RELAYER_URL` | secret / var | memory step skips gracefully if unset |
| `AGENTOS_PACKAGE_ID` | `vars` | non-secret; on/off-chain switch |
| `NEXT_PUBLIC_*` (e.g. `NEXT_PUBLIC_SUI_NETWORK`, `NEXT_PUBLIC_ENOKI_SPONSOR`) | `vars` AND build-time var | Next inlines these into the client bundle at BUILD time → must also be set in Workers Builds "Build variables", not only as runtime vars |
| `AGENTOS_REGISTRY_PATH`, `AGENTOS_RUNS_PATH`, `VERCEL` | drop | fs-path overrides; replaced by D1/KV bindings |

All external calls are `fetch`-based HTTP (Sui RPC, Walrus, Enoki, Harbor,
memwal) and work unchanged on Workers.

---

## CPU-time / limits sanity check (sponsored-tx signing, workflow runs)

- `transaction/sponsor` + `execute-sponsored`: Ed25519 signing is sub-millisecond
  CPU; the rest is `await enoki.*()` network I/O (wall-clock, not CPU). Fine.
- `workflows/[slug]/run`: orchestrates several backend calls
  (Walrus + Sui + memwal + Enoki). Wall-clock can be seconds, but **CPU time** is
  what's metered on Workers. Workers Paid default active-CPU limit is 30s,
  configurable up to **5 minutes** (`limits.cpu_ms` max 300000). Wall-clock for
  I/O is effectively unbounded on paid. So signing + multi-step workflows fit
  comfortably. Free plan (10ms CPU) would NOT — use Workers Paid.
- Subrequests: paid default budget (10,000 to CF services, large external);
  the workflow's handful of fetches is nowhere near the cap. Free plan caps at 50.

---

## Recommended path IF you proceed with Workers

1. `pnpm add -D wrangler@latest && pnpm add @opennextjs/cloudflare@latest` in
   `packages/frontend`.
2. Add `open-next.config.ts` (`export default defineCloudflareConfig()`).
3. Rename `wrangler.sample.jsonc` → `wrangler.jsonc`; create D1 + KV, paste ids.
4. Do the storage migration (Constraint 1) — the gating work.
5. Validate in `opennextjs-cloudflare preview` (workerd), paying special
   attention to `@mysten/seal` wasm and the D1/KV stores.
6. Monorepo note: OpenNext builds the standalone output which still references the
   `@agentos/sdk` workspace package — set `outputFileTracingRoot` to the repo
   root in `next.config` and deploy via Workers Builds with the monorepo root as
   build context. This is a known friction point for pnpm/turbo monorepos.

---

## Sources

- Cloudflare: Next.js on Workers (OpenNext adapter), framework guide
- Cloudflare changelog 2025-08-15: node:fs in Workers (ephemeral per-request)
- Cloudflare Workers limits: CPU time (`cpu_ms` up to 300000), subrequests
- Cloudflare D1 read-only auto-retry changelog (2025-09-11)
- OpenNext Cloudflare adapter docs + monorepo deployment notes
