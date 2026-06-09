# Setup: env, Enoki, auth, deploy

**Repo status:** Frontend wires Enoki + sponsor API + registry `/create`. Needs env keys + `packageId` for on-chain mint. SuiNS UX (two paths, bind on web): [create-agent-ux.md](./create-agent-ux.md).

---

## 1. Do you need env setup yet?

| Environment | Required today? | Notes |
|-------------|-----------------|-------|
| Local `pnpm dev` | No | Wallet Connect + mock registry is enough for demo |
| GitHub Actions CI | No extra secrets | CI only builds/tests |
| GitHub `testnet` env | Yes (when publishing Move) | `SUI_PRIVATE_KEY`, `SUI_RPC_URL` |
| Enoki + auth | Yes (for zkLogin) | 2 Enoki API keys + frontend vars |
| Cloudflare Pages | Yes (when deploying UI) | Env + domain |

---

## 2. Enoki + auth (Passkey / zkLogin + sponsor gas)

Create a project at [Enoki Portal](https://portal.enoki.mystenlabs.com) (Mysten).

### Two API key types (must be separate)

| Key | Type | Feature | Used where |
|-----|------|---------|------------|
| **Public** | Public | zkLogin, network **Testnet** | Frontend `NEXT_PUBLIC_ENOKI_API_KEY` |
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

## 4. Cloudflare — invite and deploy

Cloudflare owner **invites member** → you deploy Pages.

**Send the owner:**

- Your Cloudflare login email.
- Your GitHub account (if connecting repo via GitHub).

**Suggested role:** *Cloudflare Pages* — **Edit** (enough for preview + production deploy; Super Admin not required).

**After access — Cloudflare Pages env (Production + Preview):**

| Variable | Secret? | Notes |
|----------|---------|-------|
| `NEXT_PUBLIC_ENOKI_API_KEY` | No (public key) | Enoki public |
| `ENOKI_SECRET_KEY` | **Yes** | Enoki private |
| `NEXT_PUBLIC_SUI_NETWORK` | No | `testnet` |
| `AGENTOS_PACKAGE_ID` | No | After publish (see pipeline doc §2) |
| `AGENTOS_REGISTRY_PATH` | No | Optional if server reads registry |

Suggested build command: `cd ../.. && pnpm install && pnpm build --filter=@agentos/frontend`  
Root directory: `packages/frontend`  
Framework preset: Next.js

---

## 5. GitHub Secrets (environment `testnet`)

For `cd.yml` workflow → publish contracts:

| Secret | Description |
|--------|-------------|
| `SUI_PRIVATE_KEY` | `suiprivkey1...` — testnet deploy wallet |
| `SUI_RPC_URL` | `https://fullnode.testnet.sui.io:443` (or custom RPC) |

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
