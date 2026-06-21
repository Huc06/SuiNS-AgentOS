# Sui Overflow Plan — SuiNS-AgentOS: "ENS for AI Agents"

> Auto-generated backlog driving the Sui Overflow push. Tracking epic: **#26**. Child issues: **#27–#61** (35 total, 24 `frontend`).
> Issues were filed from a READ-only account, so labels/milestone aren't attached yet — repo owner runs `scripts/apply-sui-overflow-labels.sh` to apply them.

## 🏆 Why this wins

**SuiNS-AgentOS is ENS for AI agents — the identity, discovery, and coordination layer the agentic web is missing.** Every AI agent needs three things to be real on-chain: a name you can trust, skills you can verify, and a safe way to delegate. AgentOS ships all three natively on Sui.

The Agentic Web track asks for agents that **act, transact, and coordinate** — we map 1:1. A SuiNS name + AgentPassport object is the agent's portable identity (act). Hash-verified, Walrus-stored, Seal-gated SkillDescriptors run as PTBs with on-chain receipts (transact). A real DelegationCap — capabilities, spend-limit, expiry, revoke — lets one agent safely spawn another (coordinate).

Why it wins: every 2025 AI-track winner was a data or trading play. **Nobody built the namespace.** We own an uncontested novelty lane while leaning on the exact primitives that win — Walrus (headline ~$70K pool; every manifest stored there) and Seal (subname-gated private skills) — the same Sui+Walrus+Seal stack as 2025's first-places. We're dual-eligible: Agentic Web (primary) and Infra & DevX (MCP server + SDK + CLI).

Impact on Sui & SuiNS: this is a demand engine for *.sui names — every agent, sub-agent, and skill claims a subname, and seedless zkLogin makes naming one Google login away, zero gas, zero seed phrase. Unlike ENS text records (unverified strings), AgentOS identity lives in typed, owned, hash-pinned Move objects with on-chain reputation. We turn SuiNS from a human address book into the universal namespace for the machine economy — and ship the SDK so any agent framework can adopt it.

## 🎬 Live demo script

1. LIVE EXPLORER (Moment 1): Open the public Vercel URL. The landing page is a live grid of ~10 real testnet agents resolved by *.sui, each with a green 'verified on-chain' badge and an on-chain reputation/exec-count chip. Type in the fuzzy search box — alpha.sui autocompletes and resolves to its AgentPassport object. State the metric on screen: 'N agents named on Sui.'
2. 1-CLICK CREATE (Moment 2): Click 'Create Agent'. Sign in with Google (Enoki zkLogin) — no wallet install, no seed phrase. Type a name; the in-app SuiNS availability check confirms it's free; one click fires an Enoki-sponsored PTB that registers the subname AND mints the AgentPassport. Success screen shows the Suiscan tx digest, the AgentPassport object link, and demo-agent.agentos.sui already resolving — created with 0 SUI in the user's pocket.
3. EXPLORER ROUND-TRIP (Moment 1 reinforce): Navigate back to the explorer; the brand-new agent is now in the live grid, proving the on-chain create -> indexed -> resolved-by-name loop is real, not a mock.
4. INTEGRITY GATE (Moment 3a): Open the new agent -> Skills -> click a skill to open the Skill Execution Console. It resolves the skill by SuiNS name, reads the on-chain manifest_hash from the SkillDescriptor, downloads the manifest bytes from Walrus, and recomputes SHA-256 live in the browser — a green 'Integrity Verified: matches on-chain commitment' badge lights up. Click through to the actual blob on Walruscan.
5. RUN A SKILL (Moment 3b): Fill the skill parameter form, hit Run. Show the dry-run effects preview, then sign (or sponsor) the PTB. Render the execution digest, effects, gas, and object changes with a Suiscan link. The AgentPassport's on-chain exec counter / reputation ticks up live — proof that 'agents transact'.
6. SEAL-GATED PRIVATE SKILL (bonus, Seal beat): Open a private skill marked with the lock badge. Explain it is encrypted and only holders of a subname under *.acme.sui can decrypt+run; because our sub-agent holds that subname, seal_approve passes and the skill decrypts and executes — a gate ENS/IPFS cannot natively enforce.
7. DELEGATE (Moment 4a): Go to /agent/[name]/delegate. In the grant form, resolve a sub-agent by SuiNS name, check the allowed capabilities, set a spend-limit (SUI) and an expiry, and sign. A DelegationCap object is minted and a child subname is created. The live capability/policy delegation graph animates the new parent -> child edge.
8. DELEGATED RUN + REVOKE (Moment 4b): The sub-agent now executes a budgeted skill using the delegated capability with sponsored gas — within its spend-limit. Then the parent clicks Revoke; the on-chain DelegationCap flips to revoked, the graph edge turns red, and the next delegated run is rejected on-chain. Capability, spend-limit, expiry, and revoke all demonstrated.
9. INTEROP CLOSE (Infra & DevX): Switch to Claude/Cursor with the AgentOS MCP server connected and call agentos_resolve on the same name — the agent created live in step 2 resolves from an external AI client by name alone. End on the dual-track + Walrus-pool framing and the published testnet packageId.

## ⚠️ Risks & mitigations

- LIVE on-chain demo flakiness (RPC lag, sponsor key out of gas, wallet popup hiccup) is the #1 loss vector since judging is live. Mitigation: record a flawless single-take backup video of the exact 9-step flow; pre-seed all agents/skills via the idempotent seed script; pre-warm and fund the Enoki sponsor + a fallback funded keypair; gate every real tx behind a dry-run preview; rehearse on the actual conference network.
- Move package upgrades break object/package IDs and cost time. Mitigation: BATCH all four contract changes (delegation, reputation, events, required_capabilities) into ONE testnet publish/upgrade; pin AGENTOS_PACKAGE_ID in env everywhere; validate against a throwaway publish first; keep the upgrade cap secured and document the exact published-at id in the runbook.
- Scope overload — 35 issues, days remaining. Mitigation: enforce the P0 critical path only (contracts -> deploy -> SDK browser/delegation paths -> 4 consoles -> seed -> Vercel); treat all P1/P2 as polish that can be cut; prioritize one continuous-flow demo over feature completeness — depth-of-execution beats breadth (4 winners per track).
- Real @mysten/seal and on-chain SuiNS subname minting are heavier than the current AES stub / formatted-string fallbacks. Mitigation: make the GUARANTEED wins the hash-verify console + on-chain DelegationCap (both fully buildable today); treat the real-Seal swap and real subname creation as stretch behind feature flags — never present a stub as real on stage; if Seal slips, demo the lock badge + access-policy without claiming live key-server decryption.
- Empty/cold-start registry mid-demo — registry-server.ts falls back to os.tmpdir() on Vercel, so the explorer can render blank. Mitigation: ship a persistent/seeded read-only registry (issue #24) or pin a committed seed; verify Walruscan blobs and the live grid the morning of the demo; add loading skeletons so a slow fetch never looks broken.
- Unauthenticated /api/skills POST, /api/skills/upload, and /api/agents POST let anyone spoof the registry or burn Harbor quota during a public demo. Mitigation: add a wallet-signature/owner gate + rate-limit before the public Vercel deploy; this also opens the OtterSec/OpenZeppelin security-sponsor prize and the audit-credit pool.
- Enoki/zkLogin misconfiguration: domain not linked in the Enoki Portal, missing API keys, or sponsorship skipped on the bind path (current code only sponsors when needsBind===false). Mitigation: configure the Enoki Portal and link agentos.sui early; build the bind+mint into ONE server-side sponsored PTB scoped via allowedMoveCallTargets to agentos::agent_passport::create; test the full seedless+sponsored+claim path end-to-end days before.
- Judge opens the demo on a phone and hits the broken mobile nav/wallet wall (ConnectButton is hidden md:block; hamburger has no handler). Mitigation: ship the mobile fix (#20) and test on a real device; ensure wallet connect + management nav work at mobile width.
- SuiNS has no dedicated bounty, so ecosystem-pull only pays through the Impact axis. Mitigation: manufacture the proof — drive real subname registrations via the seedless wizard, publish an adoption number ('N agents named on Sui'), screenshot resolving *.sui names + Suiscan objects + Walruscan blobs, and proactively request a SuiNS/Mysten DevRel quote or retweet to make impact legible to judges.

## 📋 Backlog by area

### 1-click Create Agent wizard (Frontend)

| # | P | Est | Title |
|---|---|-----|-------|
| #31 | P0 | M | feat(frontend): turn create-agent-modal into a guided multi-step Create Agent wizard with shareable success state |
| #32 | P0 | M | feat(frontend): seedless zkLogin (Google) sign-in step + always-sponsored AgentPassport mint |
| #33 | P0 | L | feat(frontend): in-app SuiNS name claim — availability check + 1-click mint (replace the suins.io deep-link) |
| #34 | P1 | M | feat(frontend): runtime-wallet generation + QR funding panel in the Create wizard |

### Agent-to-agent Delegation UI (Frontend)

| # | P | Est | Title |
|---|---|-----|-------|
| #39 | P0 | L | feat(frontend): delegation grant form + delegate tx wiring on /agent/[name]/delegate |
| #40 | P0 | M | feat(frontend): live capability/policy delegation graph component |
| #41 | P1 | M | feat(frontend): sub-agent delegation list with spend/expiry status + revoke action |

### Design system & demo polish

| # | P | Est | Title |
|---|---|-----|-------|
| #46 | P0 | M | fix(frontend): make the app fully usable on mobile (nav drawer + wallet connect + responsive management shell) |
| #47 | P0 | M | feat(frontend): branded loading skeletons + empty/error states + App Router loading/error/not-found boundaries |
| #48 | P1 | M | feat(frontend): rework the landing hero — branding, act/transact/coordinate narrative, motion polish |
| #49 | P1 | L | feat(frontend): formalize design tokens, add dark mode, and run an accessibility/motion pass |

### Discovery, search & reputation UX

| # | P | Est | Title |
|---|---|-----|-------|
| #42 | P0 | M | feat(frontend): fuzzy agent search with live autocomplete in hero-search |
| #43 | P0 | M | feat(frontend): live agent explorer on landing with network/status/skill filters |
| #44 | P1 | M | feat(frontend): verified badge + reputation score on agent cards & profiles |
| #45 | P2 | S | feat(frontend): trending sort + copy-to-share for agents |

### Live Agent Explorer

| # | P | Est | Title |
|---|---|-----|-------|
| #27 | P0 | M | feat(frontend): promote a live agent explorer grid to the landing page |
| #28 | P0 | M | feat(frontend): public agent passport profile on /agent/[name] |
| #29 | P1 | M | feat(frontend): dynamic OG passport image + share metadata for agent pages |
| #30 | P1 | M | feat(frontend): global SuiNS search with typeahead and on-chain fallback |

### Move contract gaps (contracts lane)

| # | P | Est | Title |
|---|---|-----|-------|
| #54 | P0 | M | feat(contracts): add agentos::delegation module with DelegationCap (capabilities + spend limit + expiry + revoke) |
| #55 | P0 | M | feat(contracts): add on-chain reputation/attestation primitive to AgentPassport (exec counter + signed attestations + events) |
| #56 | P1 | M | feat(contracts): SuiNS subname-encoded skill record on SkillDescriptor + populate required_capabilities |
| #57 | P1 | S | feat(contracts): emit Move events on passport + skill lifecycle for an indexable Live Agent Explorer |

### SDK gaps unblocking the hero UIs

| # | P | Est | Title |
|---|---|-----|-------|
| #50 | P0 | M | feat(sdk): browser/dapp-kit signing path for executeSkill + useExecuteSkill hook |
| #51 | P0 | L | feat(sdk): implement real delegateSubAgent (delegation builders + client method + useDelegate hook) |
| #52 | P1 | M | feat(sdk): SuiNS subname resolution helpers + browser-safe useAgent/useResolveName hooks |
| #53 | P1 | M | feat(sdk): on-chain reputation read helpers + real view methods + useAgentReputation hook |

### Skill Execution Console

| # | P | Est | Title |
|---|---|-----|-------|
| #35 | P0 | L | feat(frontend): Skill Execution Console — resolve, build PTB, run via wallet, show digest/effects |
| #36 | P0 | M | feat(frontend): visible SHA-256 manifest integrity gate for the execution console |
| #37 | P1 | M | feat(frontend): skill parameter form + capability/dependency gating in the execution console |
| #38 | P1 | M | feat(frontend): execution receipt — effects, gas, object changes + dry-run preview |

### Testnet deploy, seed & demo (INFRA / ship-ability)

| # | P | Est | Title |
|---|---|-----|-------|
| #58 | P0 | M | chore(infra): publish contracts to testnet and wire packageId end-to-end |
| #59 | P0 | L | feat(infra): reproducible seed script for real testnet demo agents + Walrus skills |
| #60 | P0 | M | chore(infra): deploy frontend to Vercel with public URL + seeded read-only registry |
| #61 | P1 | M | docs(infra): one-command demo runbook + recorded video + Devpost write-up |

## 🛠 Recommended build order

1. feat(contracts): add agentos::delegation module with DelegationCap (capabilities + spend limit + expiry + revoke)
2. feat(contracts): add on-chain reputation/attestation primitive to AgentPassport (exec counter + signed attestations + events)
3. feat(contracts): emit Move events on passport + skill lifecycle for an indexable Live Agent Explorer
4. feat(contracts): SuiNS subname-encoded skill record on SkillDescriptor + populate required_capabilities
5. chore(infra): publish contracts to testnet and wire packageId end-to-end
6. feat(sdk): browser/dapp-kit signing path for executeSkill + useExecuteSkill hook
7. feat(sdk): implement real delegateSubAgent (delegation builders + client method + useDelegate hook)
8. feat(sdk): SuiNS subname resolution helpers + browser-safe useAgent/useResolveName hooks
9. feat(sdk): on-chain reputation read helpers + real view methods + useAgentReputation hook
10. feat(frontend): visible SHA-256 manifest integrity gate for the execution console
11. feat(frontend): Skill Execution Console — resolve, build PTB, run via wallet, show digest/effects
12. feat(frontend): delegation grant form + delegate tx wiring on /agent/[name]/delegate
13. feat(frontend): live capability/policy delegation graph component
14. feat(frontend): turn create-agent-modal into a guided multi-step Create Agent wizard with shareable success state
15. feat(frontend): seedless zkLogin (Google) sign-in step + always-sponsored AgentPassport mint
16. feat(frontend): in-app SuiNS name claim — availability check + 1-click mint (replace the suins.io deep-link)
17. feat(frontend): promote a live agent explorer grid to the landing page
18. feat(frontend): public agent passport profile on /agent/[name]
19. feat(frontend): live agent explorer on landing with network/status/skill filters
20. feat(frontend): fuzzy agent search with live autocomplete in hero-search
21. fix(frontend): make the app fully usable on mobile (nav drawer + wallet connect + responsive management shell)
22. feat(frontend): branded loading skeletons + empty/error states + App Router loading/error/not-found boundaries
23. feat(infra): reproducible seed script for real testnet demo agents + Walrus skills
24. chore(infra): deploy frontend to Vercel with public URL + seeded read-only registry
25. feat(frontend): skill parameter form + capability/dependency gating in the execution console
26. feat(frontend): execution receipt — effects, gas, object changes + dry-run preview
27. feat(frontend): sub-agent delegation list with spend/expiry status + revoke action
28. feat(frontend): verified badge + reputation score on agent cards & profiles
29. feat(frontend): dynamic OG passport image + share metadata for agent pages
30. feat(frontend): global SuiNS search with typeahead and on-chain fallback
31. feat(frontend): runtime-wallet generation + QR funding panel in the Create wizard
32. feat(frontend): rework the landing hero — branding, act/transact/coordinate narrative, motion polish
33. feat(frontend): formalize design tokens, add dark mode, and run an accessibility/motion pass
34. docs(infra): one-command demo runbook + recorded video + Devpost write-up
35. feat(frontend): trending sort + copy-to-share for agents
