# Demo Script: SuiNS AgentOS — Full Skill Lifecycle

**Duration:** ~10 min  
**Goal:** Show AgentOS as the first agent-native infrastructure on Sui — where AI agents get on-chain identity, publish skills to Walrus, and discover each other by name.

**Ecosystem tools shown (supporting cast):**  
Suiperpower (Move build), Claude Code (AI coding), Cursor (IDE), Antigravity (deploy)

**Star of the show:** AgentOS (identity + skill registry + MCP tools)

---

## ACT 1 — Hook: "What if your AI agent had a resume on-chain?" (2 min)

**[Screen: Claude Code terminal, large font, dark background]**

**Narrator (slow, confident):**

> You use Claude Code or Cursor every day. AI helps you code, debug, deploy. But imagine: what if your AI agent could **introduce itself on-chain** — other agents know what it can do, verify it, use it — like importing an npm package by name?

**[Type in Claude Code — slow, let camera follow:]**

```
I want to find an AI agent on Sui that can rebalance DeFi portfolios.
Its name is "defi-rebalancer.alpha-fund.sui". Show me what skills it has.
```

**[Claude Code calls MCP tool:]**

```
⏺ Called agentos (agentos_resolve_manifest)
  suinsName: "defi-rebalancer.alpha-fund.sui"

⏺ Result:
{
  "error": "Skill not found: defi-rebalancer.alpha-fund.sui"
}
```

**Narrator:**

> No agent named "alpha-fund" exists on-chain yet. Because today on Sui, AI agents have no **identity layer**. Nobody knows what an agent can do, can't verify it, can't compose with it.

**[Beat — 2 second pause]**

> AgentOS solves exactly this. It's **npm for AI agents on-chain**: register identity, publish skills to Walrus, discover by SuiNS name, execute via PTB. From any IDE.

**[Type:]**

```
Show me all available agentos tools
```

**[Claude Code lists the full toolbox:]**

```
AgentOS MCP Tools (8):

  agentos_register_agent    — Create agent identity + passport
  agentos_publish_skill     — Upload skill to Walrus + register on-chain
  agentos_resolve_manifest  — Find any skill by SuiNS name
  agentos_execute_skill     — Run skill on-chain via PTB
  agentos_import_skill      — Import from Sui Agent Skills catalog
  agentos_list_skills       — List agent's registered skills
  agentos_resolve           — Lookup agent identity by name
  agentos_dashboard_url     — Visual management dashboard link
```

**Narrator:**

> 8 operations. Enough for an AI agent to manage its entire lifecycle — from creating identity to publishing, discovering, and executing skills. No hardcoded addresses. No centralized registry. Everything on-chain, verifiable, composable.

> Now I'll show you the full flow — from zero to an agent with identity, skills, discoverable by any agent on Sui.

---

## ACT 2 — Agent Identity: Passport + SuiNS Binding (2 min)

**[Split screen: Terminal left + Browser right]**

**Narrator:**

> Step one: every agent needs a name. On Sui, that's a SuiNS name. And a credential — an Agent Passport, minted on-chain.

### 2a — Terminal: Register agent, get handoff link

**[Claude Code:]**

```
Register a new agent called "alpha-fund.sui" with runtime wallet 0xABC...
and open the dashboard to complete SuiNS binding.
```

**[MCP calls `agentos_register_agent` → returns:]**

```json
{
  "agent": {
    "slug": "alpha-fund",
    "suinsName": "alpha-fund.sui",
    "passportId": "0x...",
    "runtimeWallet": "0xABC..."
  },
  "dashboardUrl": "http://localhost:3000/create?bind=suins&runtime=0xABC&name=alpha-fund.sui"
}
```

**Narrator:**

> Terminal registers locally and prints a dashboard link. But SuiNS binding needs a browser wallet signature — security by design.

### 2b — Browser: Connect wallet, bind, mint

**[Open dashboard URL — show the /create wizard:]**

1. Connect wallet (Sui Wallet / Enoki zkLogin)
2. "Use a name I already own" → select `alpha-fund.sui`
3. Verify: ✅ Name exists, ✅ NFT owned by this wallet
4. One transaction: `setTargetAddress(0xABC...)` + `agent_passport::create`
5. **Success modal**: Suiscan tx link + "Manage Skills →"

**Narrator:**

> Browser signs, chain records. SuiNS `alpha-fund.sui` now resolves to the runtime wallet. Passport minted. Two wallets by design: owner (browser, holds the NFT) and runtime (agent machine, signs skill executions). They never share a private key.

---

## ACT 3 — Build Skill with Suiperpower (1 min)

**[Screen: Claude Code]**

**Narrator:**

> Identity done. Now the agent needs abilities — skills. We use Suiperpower to build a Move skill package.

```
/build-ai-agent

Build a Move skill "defi-rebalancer" for agent alpha-fund.sui.
Entry function: rebalance(target: vector<u8>, slippage: u64)
Deploy to testnet. Output to .suiperpower/output/
```

**[Suiperpower generates → compiles → deploys → shows packageId]**

**Narrator:**

> Move code built and deployed. But how does another agent _find_ this skill? That's where AgentOS comes in.

---

## ACT 4 — Publish: Manifest → Walrus → On-chain → SuiNS (2 min)

**[Screen: Claude Code — this is the main event]**

**Narrator:**

> One command. Three things happen: manifest stored on Walrus, SkillDescriptor registered on-chain, SuiNS subname created.

**[Type:]**

```
Publish the skill we just built from Suiperpower output
for agent alpha-fund.sui
```

**[Claude Code runs:]**

```bash
$ agentos skill publish --agent alpha-fund.sui --from-suiperpower --json

Detected Suiperpower build
  packageId: 0x6568deb1...
  manifest generated: defi-rebalancer v1.0.0
  uploading to Walrus...
  registering on-chain...

{
  "blobId": "xK9mNp2qR7...",
  "manifestHash": "a3f7c2e190...",
  "objectId": "0x8a4b9c...",
  "suinsName": "defi-rebalancer.alpha-fund.sui"
}
```

**[Narrator points to each field:]**

> - **blobId** — manifest is now on Walrus. Decentralized. Content-addressed. Anyone can fetch it.
> - **manifestHash** — SHA-256 of the manifest. Stored on-chain. Tamper-proof integrity check.
> - **objectId** — the SkillDescriptor Move object. Owner-gated. Only you can update it.
> - **suinsName** — `defi-rebalancer.alpha-fund.sui`. Any agent on Sui can find this skill by name. Like `npm install lodash`, but for agents, on-chain.

---

## ACT 5 — Discovery: Any Agent Can Find and Verify (1.5 min)

**[Still in Claude Code]**

**Narrator:**

> Now imagine you're a _different_ agent. You heard there's a DeFi rebalancer at alpha-fund. You want to use it. You only know the name.

**[Type:]**

```
Resolve skill "defi-rebalancer.alpha-fund.sui" —
show me its manifest and verify integrity
```

**[Claude Code calls `agentos_resolve_manifest`:]**

```json
{
  "descriptor": {
    "skillId": "defi-rebalancer",
    "walrusManifestBlob": "xK9mNp2qR7...",
    "manifestHash": "a3f7c2e190...",
    "version": "1.0.0",
    "dependencies": []
  },
  "manifest": {
    "name": "defi-rebalancer",
    "publisher": "@alpha-fund/defi-rebalancer",
    "sui": {
      "movePackage": "0x6568deb1...",
      "entry": "rebalancer::rebalance"
    },
    "mcp": {
      "tools": [{ "name": "rebalance", "description": "..." }]
    }
  }
}
```

**Narrator:**

> Resolved by name. Downloaded from Walrus. Hash verified against on-chain record. The resolving agent now knows _exactly_ which Move function to call, what parameters it takes, and can trust it hasn't been tampered with. Zero trust assumptions beyond the chain itself.

---

## ACT 6 — Dashboard: Visual Management (1.5 min)

**[Browser: localhost:3000/agent/alpha-fund/skills]**

**Show on screen:**

- **Skill card**: name, version, clickable Walrus link (→ Walruscan), clickable Sui link (→ SuiVision)
- **Source badge**: "Suiperpower" (because it came from Suiperpower output)
- **Status badge**: "ACTIVE" with green dot
- **Dependency graph**: SVG visualization (if dependencies exist)
- **"Publish Upgrade" button** → select new manifest → wallet signs → same SuiNS name, new version
- **"Import Skill" button** → catalog tab (Sui Agent Skills) + upload tab

**Narrator:**

> The dashboard is the owner's control panel. Upgrade skills without changing identity — `defi-rebalancer.alpha-fund.sui` stays the same, version bumps. Agents using it don't break. Import skills from the community catalog with one click.

---

## ACT 7 — Cross-IDE: Works Everywhere (30 sec)

**[Screen: Cursor IDE]**

```
Resolve skill defi-rebalancer.alpha-fund.sui
```

**[Same MCP tool, same result, different IDE]**

**Narrator:**

> No vendor lock-in. Claude Code, Cursor, any MCP client — same tools, same on-chain data, same Walrus source of truth.

---

## ACT 8 — Closing: The Stack (30 sec)

**[Clean slide:]**

```
┌─────────────────────────────────────────────────────────────┐
│  SuiNS Name       →  Human-readable agent identity          │
│  Agent Passport   →  On-chain credential (owner-gated)      │
│  Skills on Walrus →  Decentralized, content-addressed       │
│  SkillDescriptor  →  On-chain pointer + integrity proof     │
│  MCP Tools        →  Any AI agent can discover + execute    │
│  Dashboard        →  Visual management + upgrade + import   │
└─────────────────────────────────────────────────────────────┘

Build with Suiperpower. Register with AgentOS.
Discover and execute from any IDE.
```

**Narrator:**

> AgentOS is the missing layer between AI coding tools and the Sui blockchain. Agents get identity, publish skills, discover each other — all by name, all on-chain, all verifiable. This is what agent-native infrastructure looks like.

---

## Feature Checklist

| #   | Feature                                      | Shown in ACT |
| --- | -------------------------------------------- | ------------ |
| 1   | Agent Passport (on-chain mint)               | 2            |
| 2   | SuiNS binding (target → runtime)             | 2            |
| 3   | Two-wallet architecture (owner vs runtime)   | 2            |
| 4   | Terminal → browser handoff                   | 2            |
| 5   | Suiperpower skill build + deploy             | 3            |
| 6   | MCP toolbox (8 tools)                        | 1, 4         |
| 7   | Walrus manifest storage                      | 4            |
| 8   | On-chain SkillDescriptor                     | 4            |
| 9   | SuiNS skill subname                          | 4            |
| 10  | Manifest resolution + integrity verification | 5            |
| 11  | Dashboard skill cards + explorer links       | 6            |
| 12  | Dependency graph visualization               | 6            |
| 13  | Publish Upgrade (identity preserved)         | 6            |
| 14  | Skill import from catalog                    | 6            |
| 15  | Cross-IDE (Claude Code + Cursor)             | 7            |
