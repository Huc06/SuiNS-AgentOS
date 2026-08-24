# Setup: env, Enoki, auth, deploy

**Repo status:** Frontend wires Enoki + sponsor API + registry `/create`. Needs env keys + `packageId` for on-chain mint. SuiNS UX (two paths, bind on web): [create-agent-ux.md](./create-agent-ux.md).

---

## 1. Do you need env setup yet?

| Environment          | Required today?            | Notes                                             |
| -------------------- | -------------------------- | ------------------------------------------------- |
| Local `pnpm dev`     | No                         | Wallet Connect + mock registry is enough for demo |
| GitHub Actions CI    | No extra secrets           | CI only builds/tests                              |
| GitHub `testnet` env | Yes (when publishing Move) | `SUI_PRIVATE_KEY`, `SUI_RPC_URL`                  |
| Enoki + auth         | Yes (for zkLogin)          | 2 Enoki API keys + frontend vars                  |
| Cloudflare Pages     | Yes (when deploying UI)    | Env + domain                                      |

### Where server routes read secrets from (single source of truth)

`next dev` / `next build` / `next start` run with `cwd = packages/frontend`, and
Next.js only auto-loads `.env*` files from **that** directory. The repo keeps a
single `.env` at the **repo root** (`SUI_PRIVATE_KEY`, `ENOKI_SECRET_KEY`,
`MEMWAL_*`, `NEXT_PUBLIC_*`). Without help, those would be invisible to the API
routes — which is what caused the workflow-run bug
*"SUI_PRIVATE_KEY is not set — required to sign sponsored transactions"*.

The fix loads the repo-root `.env` into the Node process **before any route is
evaluated**, with `override: false` so a real `packages/frontend/.env(.local)`
still wins:

- `packages/frontend/next.config.ts` runs `dotenv` on `../../.env` at config
  time — this covers **every** server route (run, preflight, sponsor, …).
- `packages/frontend/lib/load-root-env.ts` (`loadRootEnv()`) is a
  belt-and-suspenders helper imported at the top of the workflow-run, preflight,
  and sponsor routes, so the vars are present even outside `next.config.ts`
  evaluation. It is idempotent and **never logs values**.

So you keep **one** `.env` at the repo root for local dev. On Vercel the root
`.env` is absent and platform env vars are used instead (the dotenv load is
inert). A presence-only preflight (`GET`/`POST /api/workflows/<slug>/preflight`)
reports whether `SUI_PRIVATE_KEY` / `ENOKI_SECRET_KEY` / `MEMWAL_*` are set
(**booleans, never values**) so the canvas can warn before a run.

---

## 2. Enoki + auth (Passkey / zkLogin + sponsor gas)

Create a project at [Enoki Portal](https://portal.enoki.mystenlabs.com) (Mysten).

### Two API key types (must be separate)

| Key         | Type    | Feature                         | Used where                                                    |
| ----------- | ------- | ------------------------------- | ------------------------------------------------------------- |
| **Public**  | Public  | zkLogin, network **Testnet**    | Frontend `NEXT_PUBLIC_ENOKI_API_KEY`                          |
| **Private** | Private | Sponsored transactions, Testnet | Backend / API route `ENOKI_SECRET_KEY` — **never** in browser |

### Enoki Portal — Sponsored transactions (after `packageId`)

In project → **Sponsored Transactions**, allowlist:

- **Move call targets** (after testnet publish):
  - `0xYOUR_PACKAGE_ID::agent_passport::create`
  - (hex package id from [post-suiperpower-flow.md](./post-suiperpower-flow.md) §2)
- **Addresses** (per policy): sponsor address or leave empty per Enoki docs.

### Auth flow

1. User **Sign in with Google** (Enoki zkLogin / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` override).
2. (Optional) Enoki **sponsors** mint `agent_passport::create`.
3. **SuiNS bind** on `/create` — browser wallet signs; see [create-agent-ux.md](./create-agent-ux.md). SuiNS name purchase on suins.io is paid by user, not sponsorable.

References: [Enoki sponsored transactions](https://docs.enoki.mystenlabs.com/ts-sdk/sponsored-transactions), [example app](https://github.com/sui-foundation/enoki-example-app).

---

## 3. Google OAuth — what to send your admin

**Case A — Enoki manages OAuth (common):**

1. Create app in **Enoki Portal**, enable **Google** provider.
2. Portal shows **Redirect URI** / instructions — copy that URI.
3. Send to Google Cloud admin:
   - **Authorized redirect URIs** = URI from Enoki (per environment: local + staging + production).
   - **Authorized JavaScript origins** (if Console requires):
     - `http://localhost:3000`
     - `https://<production-domain>.pages.dev` or custom domain
4. After admin creates **OAuth 2.0 Client ID (Web application)**:
   - Admin sends back **Client ID** (and **Client secret** if Enoki Portal requires manual entry).
   - Paste into **Enoki Portal** (Google provider section); **do not** commit secrets to git.

**Case B — `@mysten/dapp-kit` zkLogin without Enoki:** needs a separate OAuth client per [Sui zkLogin doc](https://docs.sui.io/concepts/cryptography/zklogin-integration) — team should pick **one** approach (Enoki recommended for sponsor + login).

**Email template for admin:**

> Please add an OAuth Web client for AgentOS zkLogin.  
> Redirect URIs: `<paste from Enoki Portal>`  
> Origins: `http://localhost:3000`, `https://<staging-domain>`  
> After creation, send me the Client ID (Web) to enter in Enoki Portal.

---

## 4. Vercel — deploy frontend

Vercel project for `packages/frontend` in this pnpm + turbo monorepo.

**Vercel Settings:**

| Setting         | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Root directory  | `packages/frontend`                                                 |
| Build command   | `cd ../.. && pnpm install && pnpm build --filter=@agentos/frontend` |
| Install command | `pnpm install`                                                      |
| Framework       | Next.js (auto-detected)                                             |
| Node.js version | 20.x                                                                |

**Environment Variables (Production + Preview):**

| Variable                         | Secret? | Notes                                                                |
| -------------------------------- | ------- | -------------------------------------------------------------------- |
| `NEXT_PUBLIC_AGENTOS_PACKAGE_ID` | No      | `0xde2423929ae03dd7620744bd23e059fc77f8198941a5d9a5be595559c6eba699` |
| `NEXT_PUBLIC_SUI_NETWORK`        | No      | `testnet`                                                            |
| `NEXT_PUBLIC_ENOKI_API_KEY`      | No      | Enoki public key                                                     |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID`   | No      | Google OAuth client ID                                               |
| `ENOKI_SECRET_KEY`               | **Yes** | Enoki private key                                                    |
| `HARBOR_API_KEY`                 | **Yes** | Harbor gateway key (optional)                                        |

The `registry.seed.json` file is bundled at build time so the explorer shows seeded agents even on a cold serverless start.

---

## 5. GitHub Secrets (environment `testnet`)

For `cd.yml` workflow → publish contracts:

| Secret            | Description                                           |
| ----------------- | ----------------------------------------------------- |
| `SUI_PRIVATE_KEY` | `suiprivkey1...` — testnet deploy wallet              |
| `SUI_RPC_URL`     | `https://fullnode.testnet.sui.io:443` (or custom RPC) |

---

## 6. Suggested order of work

1. Publish contracts testnet → `packageId` ([post-suiperpower-flow.md](./post-suiperpower-flow.md) §2).
2. Enoki allowlist `0x…::agent_passport::create`.
3. Enoki Portal: public + private keys → Cloudflare env.
4. Google OAuth (if Enoki requires) — redirect URIs ↔ Client ID.
5. Cloudflare invite + connect repo.
6. Enable `NEXT_PUBLIC_ENOKI_API_KEY` (zkLogin); sponsor optional.

---

## 7. Not needed yet

- Mainnet Enoki billing
- Production sponsor budget / rate limits ops
- In-app SuiNS pricing (v1 redirects to suins.io — [create-agent-ux.md](./create-agent-ux.md))
