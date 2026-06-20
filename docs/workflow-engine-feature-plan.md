# Visual Workflow Engine — Unified Feature Plan

Status: research + plan (decision-ready). Do NOT treat as implemented. Source files
are referenced for grounding only; this doc edits nothing.

Canvas: `packages/frontend/app/create/[slug]/page.tsx` (@xyflow/react)
Engine: `packages/sdk/src/workflow/{types,run,executors}.ts`
Run host: `packages/frontend/app/api/workflows/[slug]/run/route.ts`

Node types today: `trigger, walrus, harbor, sui, memory, import-agent, delegate,
call-sub-agent, attest`. `StepResult = {nodeId,type,status,output?,txDigest?,blobId?,error?}`.

---

## 1. Output Viewer + LIVE TRANSACTIONS filter fix

### The core insight
Per-node output is **already captured and shipped to the client**. Every executor
returns a rich `output`; the run route threads it back and `applySteps` copies
`step.output` onto node `data`. The canvas just never renders it on success — the
node box shows only a status ring + a tx/blob link, and `LogsView` renders raw
`output` JSON ONLY for error/skipped steps. So pain point (1) is a **pure rendering
gap** — no new data, no engine change.

Per-node output contract (what to render), from `executors.ts`:
- `walrus` -> `{blobId}`
- `harbor` -> `{blobId, sealPolicyId, encryptedBytes}` (today often `skipped`)
- `sui` -> `{digest, objectChanges}`
- `memory` -> `{namespace, result}` (raw relayer JSON today)
- `import-agent` -> `{agent, passportId, runtimeWallet, skillCount, catalog[]}`
- `delegate` -> `{digest, capId, childAgent, parentPassportId}`
- `call-sub-agent` -> `{digest, skill, manifestHash, verified, delegated}`
- `attest` -> `{digest, subjectPassportId, kind, score}`

### Feature A1 — per-node inline output chips (S)
Add a typed 1-2 line summary on every `done` node below the existing link.
New helper `lib/node-output.ts :: nodeOutputSummary(type, output)` returns compact
display fields per type (blobId short, digest+change count, skillCount+verified,
capId, score, namespace). Pure UI, isolated in a NEW module so the concurrently
edited `page.tsx` needs only a thin call.

### Feature A2 — expandable output detail popover + full LOGS transcript (M)
Expand affordance on the node hover toolbar opens a typed detail view (import-agent
`catalog[]` table, sui `objectChanges` disclosure, memory recalled list) + a Raw JSON
disclosure + copy buttons. Upgrade `LogsView` to render `output` for `done` steps,
not just errors — gives a complete run transcript.

### Feature A3 — LIVE TRANSACTIONS filter fix (S) — confirmed root cause
The filter logic is correct (default is already `all`; `steps.filter(s => s.type ===
txFilter)`). The bug is the **single hard-coded empty state** at
`page.tsx:1674-1677`: `filteredSteps.length === 0` -> "No transactions yet. Run the
workflow." So selecting `Delegate` after a run with no delegate step wrongly implies
the run never happened. (Note MY ACTIVITY at line 1747 already correctly keys on
`steps.length === 0`.)

Fix:
1. Key the empty state on the **full `steps` array**, not `filteredSteps`. Three states:
   - `steps.length === 0` -> "No transactions yet. Run the workflow."
   - `steps.length > 0 && filteredSteps.length === 0` -> "This run had no {TYPE}
     steps." + a one-click "Show All" reset.
   - else render rows.
2. Add per-tab **count badges** computed from `steps` (e.g. `Delegate (0)`, dimmed at
   0) so empty types are visible before clicking.

Contained edit to the LIVE TXNS card; no engine/API change.

---

## 2. Template library

Templates are static client-side graph factories `(selfName) => {nodes, edges}`,
mirroring the existing `demoCoordinateGraph` / `initialNodes` pattern. Ship in a NEW
`lib/workflow-templates.ts` (keeps page.tsx churn minimal). Surface via a **Templates
dropdown** beside the existing Demo Graph button, reusing the Runs-dropdown popover
pattern. Selecting one calls `setNodes/setEdges`.

All 8 use ONLY existing node types so they run today (templates needing recall/analyze
are gated on the memory-node work in section 3 and are flagged):

| # | Name | Chain | Demonstrates |
|---|------|-------|--------------|
| 1 | Store + Seal + Remember | trigger -> walrus -> harbor -> memory | durable storage + (faux) encryption + memory write |
| 2 | Recall -> Branch -> Sui PTB | trigger -> memory(recall) -> sui | memory feeding an on-chain action (needs recall node) |
| 3 | Import -> Delegate -> Call -> Attest | import-agent -> delegate -> call-sub-agent -> attest | full coordination loop, hash-verified sub-call |
| 4 | Memory snapshot (private) | trigger -> walrus(permanent) -> memory | durable private snapshot |
| 5 | Publish skill | trigger -> walrus -> sui | walrus blob + SkillDescriptor record |
| 6 | DeFi rebalancer stub | trigger -> memory(recall) -> sui | recall positions -> rebalance PTB (needs recall) |
| 7 | Cross-agent attestation | import-agent -> attest | score another agent on-chain |
| 8 | Encrypted manifest pipeline | trigger -> harbor -> sui | sealed manifest -> descriptor |

Templates 2 and 6 are flagged "requires memory-recall node" (section 3).

---

## 3. Walrus Memory (memwal) nodes

memwal is **live and reachable** (health: status=ok v0.1.0). The in-repo SDK
(`memwal.ts`) implements only `/remember` + `/recall`; the real API (verified via the
memwal MCP tools available in this session) is wider. Two code prerequisites before
ANY new memory node: (a) add `recall/analyze/restore` methods to `MemwalClient`; (b)
**widen `ctx.memory`** in `types.ts:221-223` beyond `{remember}` (and wire them in the
run route, which already injects `memwalFromEnv()`).

| Node | memwal API support | What it does / OUTPUT |
|------|--------------------|------------------------|
| **memory-remember** (replaces today's write node) | REAL (`/remember` -> `{job_id,status}`; bulk -> `{job_ids,total,status}`, max 20) | Persist explicit/templated text (not a blind dump of all prior outputs). OUTPUT `{namespace, jobId(s), status:'queued', count}`. NB: remember is **async/job-based** — today's "done" is misleading; show "N queued -> jobId". |
| **memory-recall** | REAL (`/recall` -> results of `{text, blob_id, distance}`, `total`; surface `score = 1 - distance`) | Semantic search; pulls memory text INTO the graph. OUTPUT `{namespace, query, total, results:[{text, score, blobId}]}` rendered as ranked memory cards. **This is the single biggest unlock for "you can't tell what a node outputs."** |
| **memory-analyze** | REAL (memwal `analyze` -> `{job_ids, facts, fact_count, status, owner}`) | LLM extracts atomic facts from a passage / prior step output and stores each. OUTPUT `{namespace, factCount, facts[], jobIds[]}` rendered as a checklist. |
| **memory-restore** | REAL (memwal `restore` -> `{restored, skipped, total, namespace, owner}`, `limit` 1-500) | Re-index a namespace's Walrus blobs into the search index (recovery). Doubles as a "is this namespace populated?" probe. OUTPUT `{restored, skipped, total}`. |
| **namespace picker** (config UX) | **NOT a memwal endpoint** — derived client-side | Dropdown of namespaces in any memory node. memwal has **NO list-namespaces and NO stats endpoint** (verified against docs + MCP tool set). Must be derived: default to agent `.sui` name (run route already sets `memoryNamespace = agent.suinsName`); maintain a known-namespaces list in `.agentos/registry.json` (every remember/analyze appends its namespace); offer free text. Optionally "verify" via `restore.total > 0`. |
| **memory-stats** (derived, best-effort) | **NO native endpoint** | Approx count per namespace. Derive from `restore(namespace, limit=500).total`. Cheap but re-indexes — better as an on-demand chip than a per-run node; mark approximate. |

Current memory executor (`executors.ts`, the `memory` step) is **write-only and
lossy**: it `JSON.stringify`s ALL prior outputs into one blob, remembers it under the
agent namespace, and emits opaque relayer JSON. Replacing it with explicit
remember/recall/analyze/restore nodes fixes both the lossy write and the invisible
output.

**Needs a backend the project does not have:** a true `list-namespaces` / per-namespace
`stats` endpoint does not exist in memwal. Until one ships, namespace inventory is a
client-side registry derivation, not a live API.

---

## 4. Harbor / Seal nodes

Today there are only 2 storage nodes, both thin: `walrus` returns just `{blobId}`;
`harbor` returns `status:'skipped'` for any non-private skill (so a Harbor tile does
nothing on a normal run). **Seal is a local AES-256-GCM stand-in**, not real threshold
Seal — `@mysten/seal@0.1.0` is installed but unused (real Seal needs live KeyServers +
a signed SessionKey). `harbor.ts` is upload+download only (no bucket-create/list/quota/
grant); `client.createSkillBucket()` throws "Not implemented". `bucket_policy.move`
`seal_approve` is **owner-only** (no grantee allow-list).

Walrus HTTP is richer than we use (verified live against the aggregator/publisher
OpenAPI): `GET /v1/blobs/by-object-id`, `GET /v1/quilts/{id}/patches` (lists files in a
quilt, no auth), `PUT /v1/blobs` with `epochs|permanent|deletable`, `PUT /v1/quilts`.
Blob status + renew are **on-chain** (Sui Blob object `end_epoch` + system object
current epoch), not an HTTP endpoint. Keep PTB-building executors signer-agnostic by
injecting builders via the existing `ctx.build` bundle (`types.ts:185`), matching how
delegate/attest/call-sub-agent already work.

| Node | Backing / status | OUTPUT (render target) |
|------|------------------|------------------------|
| **REAL Harbor + REAL Seal** (prerequisite, L) | Probe authenticated Harbor API (do NOT print the `hbr_` key); swap `seal.ts` to `@mysten/seal` behind a flag; add `bucket_policy` grantee allow-list; implement `createSkillBucket()`; make the harbor node store un-sealed for public skills instead of skipping | Unblocks every node below |
| **bucket-provision** (M) | Harbor (needs build) + `bucket_policy::create` (exists) | `{spaceId, bucketId, sealed, bucketPolicyId?, createdAtEpoch}` + txDigest |
| **file-catalog** (S quilt / M harbor) | Walrus `GET /v1/quilts/{id}/patches` (exists, no auth) and/or Harbor file-list (needs probe) | `{source, count, files:[{name, blobId, size, contentType, sealed}]}` -> scrollable file table |
| **blob-status** (M) | Walrus `by-object-id` + Sui `getObject` + system current epoch (via `ctx.client`) | `{blobId, available, currentEpoch, endEpoch, epochsRemaining}` -> "Available, 7 epochs left" badge |
| **blob-renew** (M) | Sui PTB on Walrus system object (`walrus extend`) via `ctx.build`; spends agent wallet | `{blobObjectId, previousEndEpoch, newEndEpoch, digest}` + txDigest |
| **quota-guard** (S-M) | Harbor space-usage read (**needs probe** — only upload/download are code-verified) | `{spaceId, usedBytes, limitBytes, usedPct, status}` -> usage bar; `status:error` gates downstream upload |
| **seal-grant / seal-revoke** (M) | `bucket_policy.move` (**needs grantee allow-list — contract change**) + real Seal via `ctx.build` | `{bucketPolicyId, grantee, scope, action, expiresAt?, digest}` + txDigest |
| **encrypted-retrieve** (S) | Walrus/Harbor download (exists) + `sealDecrypt` (AES today, real after prerequisite) | `{blobId, sealPolicyId, preview(<=512 chars), verified}`; on denial `status:error` with the Seal message |

**Needs backends the project does not have:** real Seal (KeyServers + SessionKey),
Harbor bucket/list/quota/grant endpoints (proposed pending an authenticated probe —
only upload+download are code-verified), and a `bucket_policy.move` grantee allow-list
(contract change — coordinate with the contracts package owner).

---

## 5. Sui Skills (docs.sui.io/skills) as importable tools

What they are: ~20 prebuilt Anthropic-style **agent CODING skills** (move, sui-sdk,
ptb, walrus-sites, ...) installed into a coding agent via `npx skills add
mystenlabs/skills`. Each is a dir with a required `SKILL.md` (frontmatter: only `name`
+ `description` guaranteed; `description` is the activation trigger), optional reference
files, and a required `evals/evals.json`. There is **NO machine-readable index JSON and
no catalog API** — discovery is via the closed-source CLI. **Most are instruction-only**
(no Move package/entry) — they teach the agent, they don't expose a callable on-chain
function. So they should surface as a **read-only reference catalog**, plus an
import-to-manifest path for the few that are Move-backed — not over-promised as
executable nodes.

The repo already has the converter: `skill-md-parser.ts::parseSkillMd` +
`convertToAgentOSManifest` produce a `sui-agent-skill/v1` manifest (`description` ->
`mcp.tools[0]`, empty `sui.movePackage/entry` when instruction-only). The gaps:

1. **Real catalog feed (M).** `app/api/skills/catalog/route.ts` returns a hardcoded
   fake 6-skill list that does NOT match real MystenLabs/skills. Replace with a
   build-time-baked `sui-skills-catalog.json` (a script fetches each `SKILL.md` from
   the GitHub raw tree, runs `parseSkillMd`, records `{id, name, description, tags,
   movePackage?, entry?, requiredCapabilities, hasEvals, isExecutable}`).
2. **Full SKILL.md import (S).** `app/api/skills/import/route.ts` builds a hollow
   minimal manifest, bypassing `parseSkillMd`. Drive the existing CLI import pipeline
   from a **server-side raw fetch** (NOT `npx` in a request handler).
3. **'My Skills' palette category (M).** Add a data-driven 6th category to the
   hardcoded Tools palette (`page.tsx:1844-1924`), listing the agent's registry skills
   + catalog skills with name + description + required-capability chips + source badge +
   Move-backed/instruction-only marker. (The palette is hardcoded today; clicking a
   tool maps a label through `LABEL_TO_TYPE` to one of the 9 engine node types — there
   is no path from a registry skill to a node yet.)
4. **`skillToNode` mapper (S).** Pure fn: Move-backed + owned by THIS agent -> a `sui`
   node (executor already accepts `params.movePackage`+`params.entry`); owned by
   ANOTHER agent -> a `call-sub-agent` node (executor -> `ctx.build.buildCallSubAgentTx`,
   which hash-verifies + capability-checks); instruction-only -> an inert note node.
5. **Eval-gate (M).** On import / at `skillToNode` time, require `evals.json` present
   AND `downloadManifest` hash-verifies before allowing conversion to an EXECUTABLE
   node; otherwise "import as note only". Reuses the `verified` flag the `import-agent`
   executor already computes per skill.
6. **Instruction-only Skill Note node (M, optional).** A new inert node type carrying
   the skill name/description/instructions as run context/output, no on-chain call —
   so instruction-only skills are visible in the graph and feed downstream memory/LLM
   steps instead of being silently dropped.

Capability-gating already exists end-to-end (`manifest.sui.policyRequired` checked
against the agent's `agentCapabilities`); surface required-capability chips in the
palette so users see what a skill needs before wiring it.

**Needs no new backend** for the catalog/import path (server-side GitHub fetch). The
only genuinely new engine piece is the optional instruction-only Skill Note node type.

---

## 6. Prioritization (P0/P1/P2)

**P0 — fix the visible pain, no new backend, low risk:**
- A3 LIVE TRANSACTIONS filter fix — per-filter empty states + count badges (S)
- A1 per-node inline output chips (S)
- Template library + Templates dropdown, 6 of 8 templates that use only existing node
  types (S)
- A2 expandable output detail + done-step LOGS transcript (M)

**P1 — high value, modest code, mostly no new backend:**
- memory-recall node (the biggest output-visibility unlock) — needs `MemwalClient.recall`
  wiring + widen `ctx.memory` (M)
- memory-remember refactor (honest async job-id output; stop dumping all prior outputs) (S-M)
- namespace picker (registry-derived dropdown; memwal has no list endpoint) (S)
- Real Sui Skills catalog feed + full SKILL.md import + 'My Skills' palette + skillToNode (M)
- Tools palette I/O descriptions + wire the decorative search box (S)
- walrus `epochs`/`permanent` knobs surfaced in node params (S)
- Templates 2 and 6 (unblocked once memory-recall lands) (S)

**P2 — high value but needs new/extended backends or contract changes:**
- memory-analyze + memory-restore nodes (M each; API exists, needs `MemwalClient` methods)
- Sui Skills eval-gate + instruction-only Skill Note node type (M)
- REAL Harbor + REAL Seal prerequisite (L) and the storage nodes that depend on it:
  bucket-provision, blob-status, blob-renew, quota-guard, seal-grant/revoke,
  encrypted-retrieve
- file-catalog (S via the no-auth Walrus quilt-patches path can land in P1; the Harbor
  path is P2 pending probe)
- `bucket_policy.move` grantee allow-list (contract change, gates seal-grant/revoke)
- memwal `list-namespaces`/`stats` endpoint (does not exist — track as an upstream ask)

### Risks / unknowns to flag before building
- Harbor bucket/list/quota/grant endpoints are proposed **pending an authenticated
  probe**; only upload+download are code-verified. Probe with a real `hbr_` key first;
  never print the key.
- "Private/encrypted/granted" is **AES theatre** until real Seal lands — do not market
  it as threshold encryption yet.
- memwal `remember` is **async/job-based**; a "done" status does not mean indexed.
- memwal has **no namespace inventory API** — a "browse memories" UI can only recall
  within a known namespace.
- Sui Skills are **editor tooling, not on-chain SkillDescriptors**; most are
  instruction-only and cannot become executable nodes — surface as reference + note
  nodes, not over-promised callable tools.
- `bucket_policy.move` allow-list and `blob-renew`/`seal-grant` PTBs touch the contracts
  package — coordinate with its owner.
