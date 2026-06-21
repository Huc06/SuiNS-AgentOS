# Visual Workflow Engine — Feature Plan (v2, critic-verified)

**Status:** decision-ready research + plan. Edits no source (other workflows are editing the
canvas/engine concurrently). A sibling `workflow-engine-feature-plan.md` exists from another
workflow; this v2 is the critic-verified pass — keep both or merge later.
**Date:** 2026-06-21. All line numbers verified against the repo on this date; treat as
landmarks (the 1,930-line canvas page is under concurrent edit).

---

## 0. Pain points → verified root causes

| # | Pain | Verified root cause | Class |
|---|------|---------------------|-------|
| 1 | Can't see a node's OUTPUT, only status | `applySteps` already copies `step.output` onto node data (`page.tsx:980`); node box + LIVE TX rows render `output` only for `error`/`skipped` (`page.tsx:1720-1728`). `done` shows status + a link. | **Pure UI render gap.** |
| 2 | "Delegate" tab → "No transactions yet" after a delegate-less run | Empty state keyed on `filteredSteps.length===0` (`page.tsx:1674`). MY ACTIVITY keys on `steps.length===0` (`page.tsx:1747`) — the correct pattern. | **One UI bug.** |
| 3 | Thin palette, no I/O descriptions | Hardcoded static array, `subtitle` only (`page.tsx:1844-1924`); search `<input>` has no `value`/`onChange` (`page.tsx:1826`); no registry-skill→node path. | **UI + small plumbing.** |
| 4 | Want more Walrus Memory / Harbor / Sui-skills features | Memory exec is lossy `JSON.stringify(prevOutputs)` (`executors.ts:517`); `ctx.memory` only `remember` (`types.ts:221-223`); `MemwalClient` has `recall` but it's unused; Harbor only upload/download; `createSkillBucket` throws (`client.ts:1166`); Seal = AES stand-in (`seal.ts`). | **Mixed: some now, some need backend/contract.** |
| 5 | Want ready-made templates | Only `defaultGraph` (`run/route.ts:70`). No template library. | **New `lib/workflow-templates.ts`.** |

---

## 1. Live-API ground truth (probed this session)

**memwal is SYNCHRONOUS, not an async job model** (probed live; `status=ok version=0.1.0`):
- `remember` → `blob_id` + `namespace`, immediately. **No `job_id`/`queued`.**
- `recall` → ranked `{ score, text }` (e.g. `score=0.713`). SDK returns `blob_id`+`distance`; display `score = 1 − distance`. **`MemwalClient.recall` exists but is unused by any executor.**
- `analyze` → per-fact `blob_id` + per-fact `done` + `succeeded/failed` counts. **Not `job_ids`.**
- `restore` → `{ total, restored, skipped }`.
- **No list-namespaces, no stats endpoint** (verified vs MCP tool set + SDK).

> Correction to the brief: memory nodes must report the REAL synchronous shape
> (`blob_id`, recall `score`, analyze `factCount`). Do NOT hard-code a fake `job_id`/`queued`
> happy path; the observed behavior is synchronous + a blob id.

**Harbor / Walrus / Seal:**
- `HarborClient` = ONLY `uploadBlob` + `downloadBlob` (`harbor.ts`). No bucket/list/quota/grant code.
- `createSkillBucket()` throws `"Not implemented"` (`client.ts:1166`).
- `harbor` node returns `status:"skipped"` for public skills (`executors.ts:100`); private path Seal-encrypts via the **local AES stand-in**.
- `seal.ts` = deterministic AES-256-GCM (`SEAL_MAGIC "AOSEAL1"`), NOT threshold. `@mysten/seal@0.1.0` installed-unused. **Do not market real Seal until G0.**
- `bucket_policy.move::seal_approve` is **owner-only**; no grantee allow-list.
- Walrus supports `?epochs=N&permanent=true` (`walrus.ts:32-37,75-81`); canvas never surfaces it.

**Sui Agent Skills (docs.sui.io/skills):** ~21 **instruction-only coding skills**, `npx skills add mystenlabs/skills`, GitHub repo, **no machine-readable catalog/API**. Converter already exists (`parseSkillMd` + `convertToAgentOSManifest`, empty `movePackage`/`entry` when instruction-only). Catalog route is a **hardcoded fake 6-skill list** (`api/skills/catalog/route.ts`) that does NOT match the real 21; import route builds a **hollow manifest** bypassing `parseSkillMd`.

---

## 2. Plan by theme

### A — Make outputs visible (P0; no backend change; the #1 pain)
- **A1 (S)** `lib/node-output.ts::nodeOutputSummary(type,output)` → typed chips on `done` nodes: walrus/harbor `blob <id…>` (+`sealed`); sui/delegate/sub-call/attest `tx <digest…> +N objects` (delegate `cap…`, attest `score N/100`); import-agent `N skills · M verified`; memory `ns … · blob …` (recall `N hits · top 0.71`). Also add an output line to LIVE TX + MY ACTIVITY rows.
- **A2 (M)** expandable per-node detail popover (import-agent catalog table, sui `objectChanges` disclosure, recall cards, Raw JSON + copy) + render `output` for `done` steps in the LOGS transcript.

### B — Fix LIVE TRANSACTIONS filter (P0; one bug)
- **B1 (S)** key the empty state on the FULL `steps` array (3 states: no run / this run had no `<Type>` steps + one-click **Show All** / rows). Mirror MY ACTIVITY at `page.tsx:1747`.
- **B2 (S)** per-tab count badges (`Delegate (0)`, dimmed at 0) from `steps`.

### C — Honest, richer Memory nodes (P1; biggest output-visibility unlock)
Prereq: widen `ctx.memory` beyond `{remember}` (`types.ts:221-223`) + wire in run route (`run/route.ts:166`). Add `analyze`+`restore` to `MemwalClient` (`recall` already there).
- **C1 (M)** `memory-recall` — query (interpolatable) + namespace + limit; pulls memory INTO the graph. Output `{ namespace, query, total, results:[{text,score,blobId}] }`, `score=1−distance`. **REAL API; recall is currently unused.**
- **C2 (S-M)** `memory-remember` refactor — persist explicit/templated text, NOT `JSON.stringify(all outputs)`. Output the REAL `{ namespace, blobId, walruscanUrl }`.
- **C3 (M, P2)** `memory-analyze` — facts checklist. Output `{ namespace, factCount, facts:[{text,blobId,status}] }`. Add `MemwalClient.analyze`.
- **C4 (M, P2)** `memory-restore` — re-index / populated-probe. Output `{ namespace, total, restored, skipped }`. Add `MemwalClient.restore`.
- **C5 (S)** namespace picker (config UX, NOT memwal-backed). Default = agent `.sui` (run route already sets it, `run/route.ts:237`); previously-used namespaces from `.agentos/registry.json`; free text. **No list endpoint exists — inventory is client-derived.**
- **C6 (P2)** `memory-stats` chip — approximate via `restore(ns,500).total`. **Mark approximate; no native stats endpoint.**

### D — Template library (P0; mostly existing node types)
New `lib/workflow-templates.ts` + a Templates dropdown. **6 of 8 use only existing node types and ship P0; 2 need `memory-recall` (C1) → P1.**

| Template | Chain | Ships |
|----------|-------|-------|
| Publish skill | `trigger→walrus→sui` | P0 |
| Store + Seal + Remember | `trigger→walrus→harbor→memory` (harbor=AES; label "demo encryption") | P0 |
| Memory snapshot (private) | `trigger→walrus(permanent)→memory` (needs E1) | P0 |
| Import, Delegate, Call, Attest | `import-agent→delegate→call-sub-agent→attest` | P0 |
| Cross-agent attestation | `import-agent→attest` | P0 |
| Encrypted manifest pipeline | `trigger→harbor→sui` (harbor=AES) | P0 |
| Recall, Branch, Sui PTB | `trigger→memory(recall)→sui` | **P1 (needs C1)** |
| DeFi rebalancer stub | `trigger→memory(recall)→sui` | **P1 (needs C1)** |

> The two recall templates are correctly FLAGGED — do NOT ship them with the `memory` WRITE node masquerading as recall.

### E — Storage knobs + palette quality (P1; small)
- **E1 (S)** surface Walrus `epochs`/`permanent` (already in `WalrusClient.uploadBlob`) as node params + chip.
- **E2 (S)** palette per-tool `{inputs, outputs}` copy; wire the decorative search box (`page.tsx:1826`).

### F — Sui Skills as read-only catalog + import (P1; NO new backend)
- **F1 (M)** replace the fake catalog (`api/skills/catalog/route.ts`) with a build-time `sui-skills-catalog.json` from a script that fetches each `SKILL.md` from GitHub **raw** (server-side, never `npx` in a handler), runs `parseSkillMd`, records `{name,description,movePackage?,entry?,requiredCapabilities,hasEvals,isExecutable}`.
- **F2 (S)** import route → drive the existing converter from a server-side raw fetch (replace the hollow manifest).
- **F3 (M)** "My Skills" palette category (registry + catalog; name/description/capability chips/source badge/Move-backed vs instruction-only marker).
- **F4 (S)** `skillToNode`: Move-backed + owned by this agent → `sui` node; Move-backed + other agent → `call-sub-agent` (hash-verifies); instruction-only → inert note (F6).
- **F5 (M)** eval-gate: require `evals.json` + `downloadManifest` hash-verify before an EXECUTABLE node, else note-only (reuses the `verified` flag, `executors.ts:285`).
- **F6 (M, P2)** instruction-only Skill Note node — the ONLY new engine piece in Theme F.

### G — Real Harbor + real Seal + storage-ops (P2; backend/contract; do last)
- **G0 (L)** prereq: real `@mysten/seal` (KeyServers + signed SessionKey), real Harbor bucket ops, `bucket_policy.move` grantee allow-list. **Probe authenticated Harbor bucket/list/quota/grant with a real `hbr_` key first; only upload+download are code-verified. Never print the key.**
- **G1 (M)** `bucket-provision` (mint `BucketPolicy` via existing `bucket_policy.move::create`).
- **G2 (S/M)** `file-catalog` — Walrus quilt-patches read is unauthenticated and could land early, **but verify the exact `GET /v1/quilts/{id}/patches` endpoint against the current aggregator first (NOT confirmed this session).**
- **G3 (M)** `blob-status` — status is ON-CHAIN (`getObject` + system epoch via `ctx.client`); no HTTP status endpoint.
- **G4 (M)** `blob-renew` — extend-epochs PTB via `ctx.build`.
- **G5 (S-M)** `quota-guard` — **needs a Harbor space-usage probe.**
- **G6 (M)** `seal-grant`/`seal-revoke` — **needs the `bucket_policy.move` grantee allow-list contract change + real Seal.**
- **G7 (S)** `encrypted-retrieve` — capped ≤512-char preview; never full secrets. AES today, real after G0.

---

## 3. Prioritized backlog

| Item | Priority | Effort | Backend/contract? |
|------|----------|--------|-------------------|
| B1+B2 LIVE TX empty-states + count badges | P0 | S | No |
| A1 per-node output chips (`lib/node-output.ts`) | P0 | S | No |
| D template library (6/8, existing nodes) | P0 | S | No |
| A2 expandable detail popover + done-step LOGS | P0 | M | No |
| C1 `memory-recall` (+ widen `ctx.memory`) | P1 | M | No (memwal exists) |
| C2 `memory-remember` refactor | P1 | S-M | No |
| C5 namespace picker | P1 | S | No |
| F1-F5 real Sui Skills catalog/import/palette/mapper | P1 | M | No (server GitHub fetch) |
| E2 palette I/O + search box | P1 | S | No |
| E1 walrus epochs/permanent params | P1 | S | No |
| D recall templates (unblocked by C1) | P1 | S | No |
| C3+C4 `memory-analyze` + `memory-restore` | P2 | M | No (2 client methods) |
| F6 instruction-only Skill Note node | P2 | M | Engine (1 node type) |
| G0 REAL Harbor + REAL Seal prereq | P2 | L | **Yes** |
| G1-G5,G7 storage-ops nodes | P2 | M | **Yes** |
| G6 seal-grant/revoke + contract allow-list | P2 | M | **Yes (contract)** |
| Track upstream memwal list/stats endpoint | P2 | S | Upstream (absent) |

---

## 4. Risks (verified)
- **Seal is theatre** (`seal.ts` AES; `@mysten/seal` unused). `harbor` skips public, AES-encrypts private. No "threshold-encrypted" copy until G0; harbor templates read "demo encryption".
- **memwal is synchronous** — report `blob_id`/`score`/`factCount`, not a fake `queued`.
- **memwal has no list/stats** — namespaces client-derived from registry; counts approximated via `restore.total` (mark approximate); browse can only `recall` a KNOWN namespace.
- **Harbor bucket/list/quota/grant unproven** — probe with a real `hbr_` key; never print it.
- **Sui Skills are coding tooling, not on-chain SkillDescriptors** — catalog + import currently FAKE the data; replace via server-side GitHub fetch + the existing converter; never `npx` in a handler.
- **`bucket_policy.move` is owner-only** — grant/revoke needs a contract change; coordinate with the contracts owner (blob-renew/seal-grant PTBs also touch contracts).
- **Concurrent edits** — put new logic in NEW `lib/node-output.ts`, `lib/workflow-templates.ts`, `lib/sui-skills-catalog.json` (+ generator); keep `page.tsx` to thin wiring + the two empty-state branches.
