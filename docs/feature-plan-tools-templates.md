# Feature Plan — Node Output Viewer, Live-Tx Filter Fix, Template Library, Walrus Memory / Harbor / Sui-Skills Tools

Status: research + plan only. Decision-ready. No source edits in this doc — other workflows are editing the canvas/engine concurrently. Land new logic in NEW `lib/*` modules so `page.tsx` needs only thin wiring.

Scope: the visual workflow engine. Canvas `packages/frontend/app/create/[slug]/page.tsx` (React Flow / `@xyflow/react`). Engine `packages/sdk/src/workflow/{types,run,executors}.ts`. Node types today: `trigger, walrus, harbor, sui, memory, import-agent, delegate, call-sub-agent, attest`.

---

## 0. Verified ground truth (from the repo + a live memwal probe this session)

These facts shaped every decision below; cite them in review.

- **Pain point (1) — invisible outputs — is a PURE RENDERING GAP, no engine/API change.** Every executor already returns `output` (`executors.ts`: walrus `{blobId}`, sui `{digest, objectChanges}`, import-agent `{skillCount, catalog}`, delegate `{capId}`, attest `{score}`, memory `{namespace, result}`). The run route threads `output` back and `applySteps` copies `step.output` onto node data (`page.tsx:980`). The canvas only renders output for `error`/`skipped` steps (`page.tsx:1720-1728`). So inline output chips on `done` nodes need ZERO engine/API change.
- **Pain point (2) — LIVE TRANSACTIONS filter bug — is a single empty-state keyed on the wrong array.** The filter logic is correct (default `all`; `steps.filter` by type). The bug: the empty state at `page.tsx:1674-1677` keys on `filteredSteps.length === 0` and prints "No transactions yet. Run the workflow." — so selecting `Delegate` after a delegate-less run wrongly implies no run happened. `MY ACTIVITY` (`page.tsx:1747`) correctly keys on `steps.length === 0` and is the reference pattern.
- **memwal is SYNCHRONOUS (blob-id), NOT async/job-based.** Live probe this session: `remember` → `Saved to Walrus Memory. blob_id=… namespace=…` (immediate, no `job_id`/`queued`); `recall` → ranked `[score=0.663] <text>` (`score = 1 − distance`). Memory node outputs MUST reflect blob-id/score, NOT a fake `queued → jobId` happy path. If the raw REST relayer ever returns 202+`job_id`, display whichever of `blobId | jobId` is present, but synchronous+`blobId` is the verified default.
- **`MemwalClient` (`sdk/src/memwal.ts`) exposes ONLY `remember` and `recall`** — `analyze` and `restore` exist as MCP tools but have NO client method. The memory executor (`executors.ts:512-520`) is **lossy**: it `JSON.stringify(prevOutputs.map(s => s.output))` and blind-writes. `ctx.memory` only exposes `{ remember }` (`types.ts:221-223`).
- **memwal has NO list-namespaces and NO stats endpoint** (verified vs the MCP tool set and the client). Namespace inventory must be DERIVED client-side; a per-namespace count can only be approximated from `restore(ns).total`.
- **Harbor = upload/download only (code-verified).** `client.createSkillBucket()` THROWS `Not implemented` (`client.ts:1166-1169`). The harbor executor returns `status:"skipped"` for any public skill (`executors.ts:100-105`) and AES-encrypts private skills.
- **`seal.ts` is an AES-256-GCM local stand-in, NOT real threshold Seal.** `@mysten/seal` is installed but unused. Do not market any harbor/private/encrypted/granted node as threshold Seal until real Seal lands.
- **`bucket_policy.move` `seal_approve` is owner-only** — no grantee allow-list today.
- **Walrus epochs / permanent are supported but unsurfaced** in node params.
- **Sui Skills (`docs.sui.io/skills`) are ~20 instruction-only Anthropic-style coding skills**, installed via `npx skills add mystenlabs/skills`. Each is a dir with a required `SKILL.md` (only name+description guaranteed; description is the activation trigger), optional reference files, a required `evals/evals.json`. NO machine-readable index JSON, NO catalog API. MOST are instruction-only (no Move package/entry) — they teach the agent, they do not expose a callable on-chain function.
- **The catalog route is a hardcoded FAKE 6-skill list** (`app/api/skills/catalog/route.ts`, verified). The import route builds a hollow minimal manifest bypassing `parseSkillMd`. The repo ALREADY has the converter: `skill-md-parser.ts` `parseSkillMd` + `convertToAgentOSManifest` → `sui-agent-skill/v1`.
- **The Tools palette (`page.tsx:1844-1924`) is a static, subtitle-only array with a dead `<input type="search">`** and no path from a registry skill to a node.

---

## A. Per-node output viewer + LIVE TRANSACTIONS filter fix (pain points 1 & 2) — P0

### A1 — Inline typed output chips on every `done` node (P0, S)

New `packages/frontend/lib/node-output.ts` exporting `nodeOutputSummary(type, output)` → a short typed chip, rendered on `done` nodes (today only `error`/`skipped` render). Per-type chips:

| Node | Chip |
|------|------|
| walrus | `blob cTXz…n5g` (short id, links to walruscan) |
| harbor | `sealed cTXz…` or `public (skipped)` (honest about AES stand-in) |
| sui | `tx 9aF…  ·  3 objects` (digest + objectChanges count) |
| import-agent | `4 skills · 3 verified` |
| delegate | `cap 0x7a…` |
| call-sub-agent | `verified ✓ · tx 9aF…` |
| attest | `score 92` |
| memory | `1 saved · ns=alice.sui` (blob-id, NOT "queued") |

Pure UI, data already present. No engine change.

### A2 — Expandable per-node output detail + done-step LOGS transcript (P0, M)

Hover-toolbar popover on each node: `import-agent` catalog table, `sui` objectChanges disclosure, memory recall list (once memory-recall lands), Raw JSON + copy. Upgrade `LogsView` to render `output` for `done` steps too (today it only shows output on error/skipped).

### A3 — LIVE TRANSACTIONS filter fix (P0, S)

The filter logic is correct; the bug is the single empty state at `page.tsx:1674-1677`. Fix = key the empty state on the FULL `steps` array (3 states):

1. `steps.length === 0` → "No transactions yet. Run the workflow." (true no-run)
2. `steps.length > 0 && filteredSteps.length === 0` → "This run had no <TYPE> steps." + a one-click **Show All** reset button.
3. rows.

Add per-tab count badges computed from `steps` (e.g. `Delegate (0)`, dimmed at 0). `MY ACTIVITY` (`page.tsx:1747`) is the reference pattern — it already keys on `steps.length`.

---

## B. Template library (pain point 5) — P0

New `packages/frontend/lib/workflow-templates.ts` + a Templates dropdown next to Run Workflow / Demo Graph. Each template carries a `tier` (`P0`-shippable now vs `P1`-gated on memory-recall) and an honest encryption label.

| # | Name | Chain | Demonstrates | Tier |
|---|------|-------|--------------|------|
| 1 | Publish skill | `trigger → walrus → sui` | Walrus blob + `SkillDescriptor` record | P0 |
| 2 | Store + Seal + Remember | `trigger → walrus → harbor → memory` | durable storage + **demo encryption (AES stand-in, not threshold Seal)** + memory write | P0 |
| 3 | Memory snapshot (private) | `trigger → walrus(permanent) → memory` | durable private snapshot | P0 |
| 4 | Import, Delegate, Call, Attest | `import-agent → delegate → call-sub-agent → attest` | full coordination loop with hash-verified sub-call | P0 |
| 5 | Cross-agent attestation | `import-agent → attest` | score another agent on-chain | P0 |
| 6 | Encrypted manifest pipeline | `trigger → harbor → sui` | sealed manifest into descriptor — **demo encryption (AES stand-in)** | P0 |
| 7 | Recall, Branch, Sui PTB | `trigger → memory(recall) → sui` | recalled memory feeding an on-chain action | **P1 — needs `memory-recall`** |
| 8 | DeFi rebalancer | `trigger → memory(recall) → sui` | recall positions then rebalance PTB | **P1 — needs `memory-recall`** |

6 of 8 ship now (only existing node types). Templates 7 & 8 are gated on `memory-recall` (C1) because today's `memory` node is write-only and lossy.

---

## C. Walrus Memory nodes (pain point 4) — all backed by REAL memwal API

memwal is SYNCHRONOUS; outputs below reflect the verified blob-id/score shape, not job ids.

### C1 — `memory-recall` (P1, M) — biggest invisible-output unlock

Semantic search that pulls memory text INTO the graph. Inputs: `namespace` (picker + free text), `query` (interpolatable from a prior step), `limit` 1–100. Renders ranked memory cards.
- Output: `{ namespace, query, total, results: [{ text, score, blobId }] }` (`score = 1 − distance`, verified ~0.66).
- Backing: REAL memwal `recall`. `MemwalClient.recall` EXISTS but is unused by any executor. Widen `ctx.memory` beyond `{ remember }` (`types.ts:221-223`) and wire it in the run route.

### C2 — `memory-remember` (P1, S-M) — replaces today's lossy write node

Persist explicit/templated text instead of blind-`JSON.stringify`-ing all prior outputs.
- Output: `{ namespace, blobId, walruscanUrl }` — show "1 saved → blob …", NOT a fake "queued → jobId".
- Backing: REAL memwal `remember` (verified synchronous `blob_id`). Refactor the existing lossy executor (`executors.ts:512-520`).

### C3 — `memory-analyze` (P2, M)

LLM extracts atomic facts from a passage / prior-step output and stores each; renders facts as a checklist.
- Output: `{ namespace, factCount, facts: [{ text, blobId, status }] }` — per-fact `blob_id` + `done` status (verified shape). NO invented `jobIds`.
- Backing: REAL memwal `analyze` (MCP-verified). **NEEDS NEW CLIENT METHOD** — `MemwalClient.analyze` does not exist; add it + `ctx.memory.analyze`.

### C4 — `memory-restore` (P2, M)

Re-index a namespace's Walrus blobs into the search index (recovery); doubles as a populated probe. `limit` 1–500.
- Output: `{ restored, skipped, total }` (counts only — restore does NOT return texts, verified).
- Backing: REAL memwal `restore` (MCP-verified). **NEEDS NEW CLIENT METHOD** — add `MemwalClient.restore` + `ctx.memory.restore`.

### C5 — namespace picker (config UX, P1, S) — NOT a memwal node

Dropdown of namespaces in any memory node. Defaults to the agent `.sui` name (the run route already sets `memoryNamespace = agent.suinsName`); offers previously-used namespaces from `.agentos/registry.json`; allows free text.
- **list-namespaces: NOT SUPPORTED by memwal — derive client-side.** memwal has NO list endpoint and NO stats endpoint (verified). Inventory is DERIVED from `.agentos/registry.json`: persist namespaces in `LocalRegistry` on every `remember`/`analyze`. A browse-memories UI can only `recall` within a KNOWN namespace.

### C6 — `memory-stats` (P2, S, best-effort) — approximate, optional

Approximate per-namespace memory count ("agent has N memories").
- Output: `{ namespace, total }` (approximate).
- Backing: NO native stats endpoint (verified). Derive from `restore(ns, limit=500).total`. Mark as approximate. Better as an on-demand chip than a per-run node.

---

## D. Harbor / Seal nodes (pain point 4) — gated on a real-backend prerequisite

### D0 — REAL Harbor + REAL Seal (PREREQUISITE, P2, L) — needs new backends

Lands actual Harbor bucket ops + real `@mysten/seal` encryption + a `bucket_policy` grantee allow-list so private/encrypted/granted nodes stop being theatre. Implement `client.createSkillBucket()` (currently throws) and make the harbor node store un-sealed for public skills instead of returning `skipped`.
- **NEEDS NEW BACKEND:** real Seal (live KeyServers + signed `SessionKey`); `@mysten/seal` installed but unused; `seal.ts` is an AES-256-GCM stand-in. **Harbor authenticated bucket/list/quota/grant paths NEED AN AUTHENTICATED PROBE** — only upload+download are code-verified. Probe with a real `hbr` key first; never print it. Everything below depends on D0.

### D1 — `bucket-provision` (P2, M)
reserve → sign → finalize a Harbor space/bucket; if private, mint a `BucketPolicy` gate via PTB.
- Output: `{ spaceId, bucketId, sealed, bucketPolicyId, createdAtEpoch }` + `txDigest`.
- Backing: Harbor (needs D0) + `bucket_policy.move::create` (exists).

### D2 — `file-catalog` (P1–P2, S) — endpoint NEEDS A PROBE
list/search files in a bucket or quilt; client-side filter; scrollable file table.
- Output: `{ source, count, files: [{ name, blobId, size, contentType, sealed }] }`.
- Backing: **Walrus quilt-patches path was NOT verifiable this session** — the exact `GET /v1/quilts/{id}/patches` endpoint/params could not be confirmed against the current aggregator. Demote from "verified-exists" to **"needs an endpoint probe before building"**; keep P1/P2 and probe first. Harbor file-list also needs a probe.

### D3 — `blob-status` (P2, M)
poll a blob's availability + epochs remaining; `epochsRemaining` drives a yellow/red badge.
- Output: `{ blobId, available, currentEpoch, endEpoch, epochsRemaining }`.
- Backing: status is ON-CHAIN (no HTTP status endpoint): `getObject(blobObject)` + system-object current epoch via `ctx.client`.

### D4 — `blob-renew` (P2, M)
extend a blob's storage by N epochs; on-chain spend from the agent wallet.
- Output: `{ blobObjectId, previousEndEpoch, newEndEpoch, digest }` + `txDigest`.
- Backing: Sui PTB on the Walrus system object (extend semantics), injected via `ctx.build` to stay signer-agnostic.

### D5 — `quota-guard` (P2, S-M) — NEEDS A PROBE
read space usage and fail/branch when near limit, gating downstream uploads.
- Output: `{ spaceId, usedBytes, limitBytes, usedPct, status }` (status `error` gates the next upload).
- Backing: **Harbor space-usage read is proposed pending a probe** (only upload/download code-verified).

### D6 — `seal-grant` / `seal-revoke` (P2, M) — NEEDS A CONTRACT CHANGE
grant/revoke scoped decryption access for a private bucket to another agent, on-chain.
- Output: `{ bucketPolicyId, grantee, scope, action, expiresAt, digest }` + `txDigest`.
- Backing: **`bucket_policy.move` `seal_approve` is owner-only today** — add a `grantees` allow-list + `grant`/`revoke` + accept owner-OR-unexpired-grantee. Plus real Seal (D0). Build via `ctx.build`. Coordinate with the contracts owner.

### D7 — `encrypted-retrieve` (P2, S)
download + Seal-decrypt a private blob; never dumps full secrets — capped 512-char preview.
- Output: `{ blobId, sealPolicyId, preview, verified }`; on denial `status:"error"` with the Seal message.
- Backing: Walrus/Harbor download (exists) + `sealDecrypt` (AES today, real after D0).

---

## E. Sui Skills as importable tools (pain point 4) — P1/P2, NO new backend for the core path

Sui Skills are editor/coding tooling, NOT on-chain `SkillDescriptor`s. Surface them as a **read-only reference catalog + an import-to-manifest path for the few Move-backed ones**, NOT as over-promised executable nodes. Capability-gating already exists end-to-end (`manifest.sui.policyRequired` vs `agentCapabilities`). The catalog/import path needs NO new backend — fetch raw `SKILL.md` server-side; **do NOT run `npx skills add` inside a request handler.**

1. **Real catalog feed (P1, M)** — replace the hardcoded FAKE 6-skill list (`app/api/skills/catalog/route.ts`) with a build-time-baked `sui-skills-catalog.json` (a script fetches each `SKILL.md` from GitHub raw, runs `parseSkillMd`, records `movePackage`/`entry`/`requiredCapabilities`/`hasEvals`/`isExecutable`).
2. **Full SKILL.md import (P1, S)** — the import route builds a hollow minimal manifest bypassing `parseSkillMd`; drive the existing CLI import pipeline from a SERVER-SIDE raw fetch.
3. **My Skills palette category (P1, M)** — add a data-driven palette category listing the agent's registry + catalog skills with name+description+required-capability chips + source badge + Move-backed/instruction-only marker (the palette at `page.tsx:1844-1924` is hardcoded with no registry→node path; also wire the dead search box).
4. **`skillToNode` mapper (P1, S)** — Move-backed + owned by this agent → `sui` node (executor already takes `params.movePackage`+`entry`); owned by another agent → `call-sub-agent` node (executor calls `ctx.build.buildCallSubAgentTx`, which hash-verifies + capability-checks); instruction-only → inert note node.
5. **Eval-gate (P2, M)** — require `evals.json` present AND `downloadManifest` hash-verifies before allowing conversion to an EXECUTABLE node, else import as note only; reuses the `verified` flag the import-agent executor already computes.
6. **Instruction-only Skill Note node (P2, M, optional, the ONLY new engine piece)** — a new inert node type carrying skill name/description/instructions as run context/output, no on-chain call, so instruction-only skills are visible and feed downstream memory/LLM steps.

---

## F. Tools palette polish (pain point 3) — P1, S

- Add input/output descriptions to every tool in the palette (it is subtitle-only today).
- Wire the decorative `<input type="search">` (`page.tsx:1826`) to actually filter the palette.
- Surface Walrus `epochs`/`permanent` knobs in the `walrus` node params (supported but unsurfaced).

---

## G. Prioritized build order (P0 / P1 / P2 + effort)

### P0 — ship first (zero/low backend risk; all UI/data-already-present)
1. **LIVE TRANSACTIONS filter fix** — per-filter empty states keyed on full `steps` + per-tab count badges (`page.tsx:1674-1677`). **S**
2. **Per-node inline output chips** on `done` nodes (new `lib/node-output.ts`; pure UI, data already present). **S**
3. **Template library + Templates dropdown** (6 of 8 use only existing node types; new `lib/workflow-templates.ts`). **S**
4. **Expandable per-node output detail popover + done-step LOGS transcript.** **M**

### P1 — high value, modest backend wiring
5. **`memory-recall` node** (biggest output-visibility unlock) — wire `MemwalClient.recall` + widen `ctx.memory`. **M**
6. **`memory-remember` refactor** — honest synchronous blob-id output; stop dumping all prior outputs. **S-M**
7. **namespace picker** — registry-derived dropdown (memwal has NO list endpoint). **S**
8. **Real Sui Skills catalog feed + full SKILL.md import + My Skills palette + `skillToNode` mapper** — server-side GitHub fetch, no new backend. **M**
9. **Tools palette I/O descriptions + wire the search box.** **S**
10. **Surface Walrus epochs/permanent knobs** in node params. **S**
11. **Templates 7 & 8** (unblocked once `memory-recall` lands). **S**
12. **`file-catalog`** — only after the Walrus quilt-patches / Harbor file-list endpoint is probed. **S**

### P2 — needs new backends / contract changes / a probe
13. **`memory-analyze` + `memory-restore` nodes** — API exists; add `MemwalClient.analyze`/`restore` + `ctx.memory` methods. **M**
14. **Sui Skills eval-gate + instruction-only Skill Note node type.** **M**
15. **REAL Harbor + REAL Seal prerequisite (D0)** — needs KeyServers/`SessionKey` + an authenticated Harbor probe. **L**
16. **Storage nodes depending on D0:** `bucket-provision`, `blob-status`, `blob-renew`, `quota-guard`, `encrypted-retrieve`. **M**
17. **`seal-grant`/`seal-revoke` + `bucket_policy.move` grantee allow-list** (contract change). **M**
18. **`memory-stats`** (derived from `restore().total`, approximate). **S**
19. **Track upstream: a memwal list-namespaces/stats endpoint** (does not exist today). **S**

---

## H. Risks / honesty guardrails

- **Harbor bucket/list/quota/grant endpoints are PROPOSED pending an authenticated probe** — only upload+download are code-verified. Probe with a real `hbr` key first; never print it.
- **Private/encrypted/granted is AES-256-GCM theatre until real Seal lands** (`@mysten/seal` installed but unused). Do NOT market it as threshold encryption. Templates "Store + Seal + Remember" and "Encrypted manifest pipeline" must carry a "demo encryption (AES stand-in)" label until D0.
- **memwal is SYNCHRONOUS — report `blob_id` (and recall `score`), NOT "queued"/`jobId`.** A live `remember` returns a blob id immediately; `analyze` returns per-fact `blob_id` + `done`, not `jobIds`.
- **memwal has NO namespace-listing and NO stats endpoint** — namespace inventory is derived client-side from `.agentos/registry.json` (default = agent `.sui` name); a browse-memories UI can only `recall` within a known namespace.
- **`file-catalog` (D2) is endpoint-unverified** — the Walrus quilt-patches path could not be confirmed this session; probe before building.
- **Sui Skills are editor/coding tooling, not on-chain `SkillDescriptor`s** — most are instruction-only and cannot become executable nodes. Surface as reference + inert note nodes. Do NOT run `npx skills add` inside a Next.js request handler; fetch raw `SKILL.md` server-side.
- **`bucket_policy.move` grantee allow-list and the `blob-renew`/`seal-grant` PTBs touch `packages/contracts`** — coordinate with the contracts owner; `seal_approve` is owner-only today.
- **Other workflows are editing the canvas/engine concurrently** — land new logic in NEW `lib/*` modules (`node-output.ts`, `workflow-templates.ts`) so `page.tsx` needs only thin wiring and merge conflicts stay minimal.
