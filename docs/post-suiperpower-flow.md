# Suiperpower → AgentOS pipeline

From Suiperpower build to an agent discoverable on the dashboard.

- **Create agent + SuiNS UX:** [create-agent-ux.md](./create-agent-ux.md)
- **Enoki, deploy, secrets:** [setup-env-auth-deploy.md](./setup-env-auth-deploy.md)

---

## Roles of the two tools

**Suiperpower** — build lane ([suiperpower.dev](https://www.suiperpower.dev/)): `build-with-move`, `deploy-to-testnet`, `verify-against-intent`.

**AgentOS** — register + discover. No separate skill pack in this repo; use CLI or MCP.

```
Suiperpower (terminal)     →  Move deploy, skill manifest
        ↓
agentos init + publish     →  packageId, .agentos/config.json
        ↓
Web /create (browser)      →  SuiNS bind + mint passport + registry
        ↓
agentos skill publish      →  registry (+ Walrus / on-chain later)
        ↓
Dashboard /api/resolve     →  discover
```

**SuiNS is not done in the terminal** — Claude Code / MCP prints or opens a web link:  
`{dashboardUrl}/create?bind=suins&runtime=0x…` — details in [create-agent-ux.md](./create-agent-ux.md).

---

## Three layers

| Layer | Tool | Status |
|-------|------|--------|
| Build Move + skill | Suiperpower | Outside repo |
| Register metadata | `agentos` CLI / MCP / `/api/*` | ✅ `.agentos/registry.json` |
| On-chain + Walrus + MVR | Contracts + wallet | ⏳ partial |

```mermaid
flowchart TD
  A[Suiperpower: Move + manifest] --> B[Publish contracts → packageId]
  B --> C[agentos init + config]
  C --> D[SuiNS bind on web /create]
  D --> E[Mint AgentPassport]
  E --> F[Walrus manifest + skill publish]
  F --> G[MVR @org/pkg → packageId]
  G --> H[/api/resolve + /agent/slug]
```

---

## 1. Suiperpower output

1. `build-with-move` — package the agent.
2. `deploy-to-testnet` — `packageId`.
3. `verify-against-intent` — if `.suiperpower/intent.md` exists.

Keep: `packageId`, `skill.manifest.json` (`publisher: "@org/pkg"`), (optional) Walrus blob id.

---

## 2. Publish contracts + configuration

Core on-chain flows require a published Move package id.

### GitHub Actions (team)

1. Add secrets to the **testnet** environment: `SUI_PRIVATE_KEY`, `SUI_RPC_URL`
2. Actions → **CD** → Run workflow → `contracts-testnet`
3. Copy `packageId` from job logs

### Local publish

```bash
sui client switch --env testnet
sui client gas

cd packages/contracts
sui client publish --gas-budget 200000000 --json | tee publish-testnet.json
```

Run each line separately — **do not** paste shell comments `# ...` on the same line as a command.

`publish-testnet.json` / `publish.json` are local artifacts — do not commit (see `.gitignore`).

### Config

```bash
# repo root
pnpm exec agentos init   # if needed
```

`.agentos/config.json`:

```json
{
  "network": "testnet",
  "packageId": "0xYOUR_PACKAGE_ID",
  "registryPath": ".agentos/registry.json",
  "dashboardUrl": "http://localhost:3000"
}
```

Frontend (on-chain mint from UI):

```env
# packages/frontend/.env.local
NEXT_PUBLIC_AGENTOS_PACKAGE_ID=0xYOUR_PACKAGE_ID
```

Verify CLI on-chain create:

```bash
export SUI_PRIVATE_KEY=suiprivkey1...
agentos agent create my-agent.sui --wallet 0xYOUR_ADDRESS --on-chain
```

Enoki sponsor (optional): `NEXT_PUBLIC_ENOKI_SPONSOR=true` + server `ENOKI_SECRET_KEY` — see [setup-env-auth-deploy.md](./setup-env-auth-deploy.md).

---

## 3. SuiNS + passport

**UX:** [create-agent-ux.md](./create-agent-ux.md) — Path A (testnet.suins.io) / Path B (bind on web) / terminal→browser handoff.

**On-chain + UI (testnet):**

- `agent_passport::create` + `transferObjects` to signer wallet ✅
- SuiNS `setTargetAddress` when target ≠ runtime ✅
- Registry `POST /api/agents` ✅ (server-side validate ⏳)
- Delete from registry: `DELETE /api/agents/[slug]`, `agentos agent delete` ✅

Create agent + bind SuiNS on **web** `/create`. CLI `agent create` is for scripts/dev when name + wallet are already set:

```bash
agentos agent create my-agent.sui --wallet 0xRUNTIME
agentos agent create my-agent.sui --wallet 0xRUNTIME --on-chain   # + SUI_PRIVATE_KEY
```

---

## 4. MVR

`publisher` in the manifest = MVR name (`@my-agent/web-search`); `sui.movePackage` = hex after deploy.

| Field | Role |
|-------|------|
| `mvrPackage` / `publisher` | Metadata + `SkillDescriptor.mvr_package_name` |
| `sui.movePackage` | Actual Move package |

Register the name on the MVR registry — **not wired yet**; use Suiperpower `suins-integration` (MVR section) after publish.

---

## 5. Publish skill (three meanings)

| Type | Command / UI | Status |
|------|--------------|--------|
| **Registry** | `agentos skill publish manifest.json --agent name.sui` | ✅ |
| **Walrus** | `--walrus <blobId>` | ⏳ manual upload |
| **On-chain** | `skill_descriptor::create` | ⏳ `--dry-run` only |

```bash
agentos skill publish ./examples/skill.manifest.json --agent my-agent.sui
```

---

## 6. Discover

| Channel | Entry |
|---------|--------|
| API | `GET /api/resolve?name=…` |
| Web | `/agent/{slug}` |
| CLI | `agentos agent resolve …` |
| MCP | `agentos_resolve`, `agentos_dashboard_url` |

---

## CLI & MCP

```bash
agentos init
agentos skill publish ./examples/skill.manifest.json --agent my-agent.sui
agentos agent resolve my-agent.sui
```

`.cursor/mcp.json`:

```json
{
  "mcpServers": {
    "agentos": {
      "command": "npx",
      "args": ["-y", "@agentos/mcp"],
      "env": { "AGENTOS_REGISTRY_PATH": ".agentos/registry.json" }
    }
  }
}
```

| Tool | When to use |
|------|-------------|
| `agentos_resolve` | After user binds on web |
| `agentos_dashboard_url` | Link to `/agent/{slug}` |
| `agentos_publish_skill` | After building a skill |
| `agentos_register_agent` | Dev/metadata — **does not** replace SuiNS bind on web |

Use **Suiperpower** for Move; when identity is needed, open the **dashboard** (not only `register_agent` in the terminal).

---

## Status & next steps

| Item | Status |
|------|--------|
| Registry agent/skill | ✅ |
| packageId + publish testnet | ✅ (team local / CD) |
| SuiNS bind + mint UI | ✅ [create-agent-ux.md](./create-agent-ux.md) |
| Delete agent | ✅ |
| Walrus + SkillDescriptor on-chain | ⏳ |
| MVR register | ⏳ |
| Enoki sponsor | scaffold; needs `NEXT_PUBLIC_ENOKI_API_KEY` |

**Next:** Walrus + on-chain skill → MVR → Enoki public key → Suiperpower skill demo E2E.

---

## Quick commands

```bash
pnpm exec agentos init
# packageId in .agentos/config.json

open "http://localhost:3000/create?bind=suins&runtime=0xRUNTIME"

agentos skill publish ./examples/skill.manifest.json --agent my-agent.sui
agentos agent resolve my-agent.sui
```
