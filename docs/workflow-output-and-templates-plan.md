# Feature Plan — Per-Node Output Viewer, LIVE TXNS filter fix, Template Library

Scout: output-and-templates. Decision-ready plan. Research + design only — no source edits here (the canvas/engine are being edited by concurrent workflows). All file paths absolute.

## 0. Where things stand (grounded in the repo)

Canvas: `/Users/harryphan/Documents/dev/SuiNS-AgentOS/packages/frontend/app/create/[slug]/page.tsx` (1931 lines, single client component).
Engine: `/Users/harryphan/Documents/dev/SuiNS-AgentOS/packages/sdk/src/workflow/{types,run,executors,diagnose}.ts`.
Run API: `/Users/harryphan/Documents/dev/SuiNS-AgentOS/packages/frontend/app/api/workflows/[slug]/run/route.ts` (+ `runs`, `runs/[runId]`, `preflight`).

Key fact: **every executor already returns a rich `output` object** (`StepResult.output?: unknown`, types.ts:64), and the run route already threads it to the client (`applySteps` copies `step.output` onto node data, page.tsx:980). **The output payload is captured end-to-end but never rendered.** The node box shows only a status ring + a `tx ↗`/`blob ↗` link (page.tsx:522-550); the LIVE TXNS / MY ACTIVITY rows show only node id + type + status + link (page.tsx:1680-1804); the LOGS view renders `output` as a raw `JSON.stringify` but ONLY for `error`/`skipped` steps (page.tsx:885). So a successful node's structured output is invisible. This is pain point (1) and it is a pure-rendering gap — the data is already on the client.

### Real `output` shape per node type (from executors.ts — this is the contract to render against)

| type | `output` keys (on success) | also sets |
|---|---|---|
| `trigger` | `{ started:true, params }` | — |
| `walrus` | `{ blobId }` | `blobId` |
| `harbor` | `{ blobId, sealPolicyId, encryptedBytes }` (or `{ note }` when public→skipped) | `blobId` |
| `sui` | `{ digest, objectChanges }` (or `{ note }` when nothing to exec→skipped) | `txDigest` |
| `memory` | `{ namespace, result }` (or `{ note:"memwal not configured" }` skipped) | — |
| `import-agent` | `{ agent, passportId, runtimeWallet, skillCount, catalog:[{skillId,name,version,manifestHash,verified,requiredCapabilities,entry,movePackage,error?}] }` | — |
| `delegate` | `{ digest, capId, childAgent, parentPassportId }` | `txDigest` |
| `call-sub-agent` | `{ digest, skill, manifestHash, verified, delegated }` | `txDigest` |
| `attest` | `{ digest, subjectPassportId, kind, score, recipient|shared }` | `txDigest` |

### LIVE TRANSACTIONS filter bug (pain point 2) — root cause confirmed

page.tsx:1263 — `filteredSteps = txFilter === "all" ? steps : steps.filter(s => s.type === txFilter)`. Default is already `"all"` (state init page.tsx:939). The bug is the **empty state is a single hard-coded string** (page.tsx:1674-1677): `"No transactions yet. Run the workflow."` It fires whenever `filteredSteps.length === 0` — including when a run *did* happen but contained no node of the selected type. So selecting "Delegate" after a Walrus/Sui run shows "No transactions yet" even though the run succeeded. The string conflates "you haven't run anything" with "this run had no Delegate step." The fix is per-filter empty-state copy keyed on whether `steps` (the full run) is non-empty. Same fix applies to the filter tabs being "confusing": tabs for types absent from the current run should be visually de-emphasised (count badge of 0).

### Tools palette (pain point 3)

page.tsx:1844-1924 — five `<details>` categories (storage/security/blockchain/coordination/triggers). Each tool is `{ label, subtitle }` only; subtitle is a 2-3 word blurb ("Store manifest", "Seal encrypt"). No inputs/outputs description, no search wiring (the search `<input>` page.tsx:1826 is decorative), click just appends a node at a random position. This is thin and gives the user zero idea what a node consumes/produces.

### Live API surfaces actually available (pain point 4)

- **Walrus** (`walrus.ts`): `PUT /v1/blobs?epochs=N&permanent=true`, `GET /v1/blobs/{id}`. Knobs already in `WalrusUploadOptions`: `epochs` (storage duration), `permanent` (vs deletable). Testnet public publisher only; **no public mainnet publisher** (walrus.ts:14-16). Walruscan blob explorer link already wired.
- **Harbor** (`harbor.ts`): `POST /api/v1/spaces/{spaceId}/buckets/{bucketId}/files` (Seal-encrypted bucket upload), `GET /api/v1/blobs/{id}`. Has the **spaces → buckets** hierarchy and per-bucket `seal_approve` policy (`BucketPolicy` in contracts). The current `harbor` node only exposes a boolean `private` + `sealPolicyId`; it does not surface spaces/buckets at all.
- **Walrus Memory (memwal)** — the live MCP server (`memwal_health` returned `status=ok version=0.1.0`) exposes a **much wider surface than the SDK client**. SDK `MemwalClient` (`memwal.ts`) only has `remember(ns,text)` + `recall(ns,query,limit)`. The MCP tools add: `memwal_recall`, `memwal_remember`, `memwal_remember_bulk` (batch), `memwal_analyze` (LLM extracts facts from a passage → saves each), `memwal_restore` (re-index a namespace from Walrus blobs; returns restored/skipped/total counts), `memwal_health`. There is **no namespace-listing / stats endpoint** exposed — recall and restore are both namespace-scoped (you must already know the namespace). So the memory feature surface we can offer: remember, bulk-remember, recall (semantic), analyze (extract+remember), restore (recovery/re-index). That is 5 distinct memory operations vs the 1 (`remember`) the `memory` node does today.
- **Sui Skills** (`https://docs.sui.io/skills`): a GitHub repo `MystenLabs/skills` of ~21 prebuilt agent-coding skills (Move build/test, publish/upgrade, PTBs, dApp Kit, Walrus Sites, client/CLI config). Installed via `npx skills add mystenlabs/skills --all|--skill <name>`. **It is NOT the same as an AgentOS `SkillDescriptor`** — it is editor tooling, not an on-chain manifest. The realistic integration: surface the Sui skills catalog as **importable reference tools** in the palette (a read-only catalog the user can browse / link out to), and/or a `skill import`-style adapter, NOT executable workflow nodes. Flag this distinction clearly in the plan so we don't over-promise.

---

## Feature A — Per-Node Output Viewer + LIVE TXNS filter fix

### A1. Inline output chips on the node box

On a `done` node, below the existing `tx ↗`/`blob ↗` links, render a compact **typed output summary** (1-2 lines, monospace, truncated). It is a pure switch on `data.output` keyed by `wfType`. No new data — `data.output` is already populated by `applySteps`.

- `walrus`/`harbor` → `blob <id8>…` (+ `🔒 sealed` chip when `sealPolicyId`), `· {epochs}ep` if present.
- `sui` → `tx <digest8>…` + `{n} changes` (count `objectChanges` length).
- `memory` → `remembered → {namespace}` (or recall variant: `{n} recalled`).
- `import-agent` → `{skillCount} skills` + a `verified {k}/{n}` badge.
- `delegate` → `cap <capId8>…`.
- `call-sub-agent` → `{skill} ✓verified` / `⚠unverified`, `delegated` chip.
- `attest` → `score {score} · {kind}`.

Implementation: one helper `nodeOutputSummary(type, output): {chips: string[]}` (add to a new `lib/node-output.ts` so it's reusable in the panel too — keep it framework-free, no SDK import). Render chips as small bordered spans matching the existing neo-brutalist style.

### A2. Expandable per-node detail / logs panel

Add a node-level "expand" affordance (chevron in the hover toolbar next to Edit/Delete, page.tsx:389-416). Clicking opens a popover (reuse the inline-config popover pattern, page.tsx:591-621) titled `{label} output` containing:
- a **typed, formatted view** (not raw JSON) for the common cases — e.g. for `import-agent`, a small table of `catalog` rows (name · version · verified · capabilities); for `sui`, the digest + a count and a "view changes" disclosure; for `memory`, namespace + recalled list.
- a **Raw JSON** disclosure (`<pre>`) for power users — this generalises the existing `JSON.stringify(output)` but for ALL statuses, not just error/skipped.
- the explorer links (tx/blob) and copy-to-clipboard buttons for ids/digests.

Also upgrade the bottom-panel **LOGS view** (page.tsx:817 `LogsView`): currently it only renders `output` for `error`/`skipped`. Change it to render the typed output summary for `done` steps too (so the LOGS tab becomes a full run transcript, not just a failure list). Keep error/skipped sorted first.

### A3. Fix the LIVE TRANSACTIONS filter + per-filter empty states

In the LIVE TRANSACTIONS card (page.tsx:1636-1734):
1. **Keep default = All** (already correct).
2. **Per-filter count badges**: compute `countByType` from `steps` and render each tab label with its count, e.g. `Delegate (0)`. Tabs with 0 are dimmed but still clickable (so the user sees *before* clicking that this run had no Delegate step).
3. **Three distinct empty states** (replace the single string):
   - no run yet (`steps.length === 0`): "No transactions yet. Run the workflow." (unchanged).
   - run happened, filter is a specific type with 0 matches (`steps.length>0 && filteredSteps.length===0`): "This run had no **{TYPE_LABEL[txFilter]}** steps. Switch to **All** to see {steps.length} step(s)." + a one-click "Show All" button that sets `txFilter='all'`.
   - run happened, All selected, 0 rows: impossible (All shows everything) — no special case.
4. Apply the same empty-state logic to MY ACTIVITY (it currently has no filter, so just the run-vs-no-run string — already fine, leave it).

This is a contained change to one card + one helper; no engine/API change.

### A4. (Optional, follow-up) richer LIVE TXNS rows

Add the inline output summary (A1 chips) as a third line under each LIVE TXNS row so the panel shows *what* each step produced, not just status+link. Low effort once `nodeOutputSummary` exists.

### A — effort & touch points
- New: `packages/frontend/lib/node-output.ts` (typed summary + chips, pure).
- Edit (later, by impl workflow): `app/create/[slug]/page.tsx` — `SkillNode` (inline chips + expand popover), `LogsView` (render done output), LIVE TXNS card (count badges + 3 empty states).
- No SDK/engine/API change. Data already flows. **Effort: M** (mostly UI; the data contract exists).

---

## Feature B — Template Library

### B1. Storage & selection (UI)

Templates are **static client-side graph factories**, exactly like the existing `demoCoordinateGraph(selfName)` / `initialNodes` (page.tsx:633-786). Each template is a function `(selfName) => { nodes, edges }`. Store them in a new module `packages/frontend/lib/workflow-templates.ts` exporting:

```ts
export interface WorkflowTemplate {
  id: string;
  name: string;
  category: "storage" | "memory" | "coordination" | "defi" | "skills";
  blurb: string;            // one-line "what it demonstrates"
  demonstrates: string[];   // bullets for a tooltip/detail
  build: (selfName: string) => { nodes: Node[]; edges: Edge[] };
}
export const WORKFLOW_TEMPLATES: WorkflowTemplate[];
```

UI: replace the single **Demo Graph** button (page.tsx:1403-1411) with a **Templates ▾ dropdown** next to it (reuse the Runs-dropdown popover pattern, page.tsx:1346). Group by `category`, each row shows `name` + `blurb`; clicking calls `setNodes/setEdges` (same as `loadDemoGraph`, page.tsx:1213) and clears `latestRun`. Keep "Demo Graph" as one entry inside the dropdown for back-compat. Persisting user-authored templates is out of scope (these ship as built-ins); a later phase can save a canvas to `.agentos/registry.json` as a named template.

### B2. The templates (8, all runnable against the existing executors)

Each chain uses only existing node types. `selfName` = current agent's `.sui` (default target). Edges are smoothstep dashed, matching house style.

1. **Store + Seal-encrypt + Remember** — `trigger → walrus → harbor(private,sealPolicyId) → memory`. Demonstrates: public blob store, Seal-encrypted private store, and writing a memory of the run. (This is essentially the current `initialNodes` demo, promoted to a named template.)

2. **Recall → branch → Sui PTB** — `trigger → memory(recall) → sui`. Demonstrates: semantic recall feeding an on-chain action. *Requires the memory node to gain a `recall` mode (see B3).* Until then, ship as `trigger → memory(remember) → sui` and label "recall variant pending node mode."

3. **Import agent → delegate → call-sub-agent → attest** — `trigger → import-agent → delegate → call-sub-agent → attest`. The full coordination loop (this is the existing `demoCoordinateGraph`, promoted). Demonstrates read-only catalog, cap grant, delegated execution, reputation write.

4. **Memory snapshot (private)** — `trigger → walrus(permanent) → harbor(private) → memory`. Demonstrates a durable, Seal-encrypted snapshot persisted to memory; uses Walrus `permanent:true` + `epochs`. Surfaces the new storage knobs (B3).

5. **Publish skill (walrus + on-chain descriptor)** — `trigger → walrus(manifest) → sui(SkillDescriptor::create)`. Demonstrates the publish path as a graph: upload manifest blob, then record the descriptor on-chain. The `sui` node uses `params.movePackage`/`entry` to target the descriptor create. (Mirrors `AgentOSClient.publishSkill`.)

6. **DeFi rebalancer stub** — `trigger → import-agent → memory(recall) → sui(rebalance PTB) → memory(remember) → attest`. Demonstrates a realistic agent loop: read strategy/positions, recall prior state, execute a rebalance PTB, persist the new state, attest the outcome. Ships as a *stub* (the `sui` node points at a placeholder package/entry; ties to the existing `examples/defi-rebalancer` Move package).

7. **Cross-agent attestation** — `trigger → import-agent → attest`. Lightweight: resolve another agent's catalog, write a reputation attestation. Good "hello world" for the coordination tools without delegation.

8. **Encrypted manifest pipeline** — `trigger → harbor(private) → sui(record_execution)`. Demonstrates the Seal-only path + an on-chain execution record, the minimal "private skill ran" proof.

(6-8 give coverage across memory, defi, coordination, and security so the dropdown's categories aren't lopsided.)

### B3. Node-capability gaps these templates expose (feeds pain point 4)

Templates 2/4/6 want capabilities the current nodes don't have. These are **proposed node enhancements** (listed in structured output), small and additive:
- **`memory` node mode** — add `params.mode: "remember" | "recall" | "analyze"` + `params.query`/`limit`. The SDK `MemwalClient` already has `recall`; the executor only calls `remember` (executors.ts:512). Recall/analyze need `ctx.memory.recall`/`.analyze` added to the injected memory bundle (host wires `memwalFromEnv()` which already supports recall; `analyze` would call the relayer's analyze endpoint or be a host concern). This unlocks templates 2 and 6 and is the single highest-leverage memory upgrade.
- **`walrus` node knobs** — expose `params.epochs` + `params.permanent` (already in `WalrusUploadOptions`, just not surfaced in the node param fields `NODE_PARAM_FIELDS`, page.tsx:154). Trivial. Unlocks template 4's "durable snapshot."
- **`harbor` node spaces/buckets** — optional `params.spaceId`/`bucketId` to target a real Harbor bucket (the client supports it; the executor currently always falls back to Walrus). Medium effort.

### B — effort & touch points
- New: `packages/frontend/lib/workflow-templates.ts` (8 builders + metadata).
- Edit (later): `app/create/[slug]/page.tsx` — Templates dropdown replacing/augmenting Demo Graph button; `NODE_PARAM_FIELDS` to add walrus/memory/harbor fields (B3).
- SDK (later, optional, for templates 2/4/6 to be fully live): `memory` executor mode + `walrus` executor opts + the injected `ctx.memory` bundle.
- **Effort: S** for templates+dropdown (pure client graph factories, reuses `loadDemoGraph`); **+M** if we also ship the B3 node modes.

---

## Tools palette upgrade (pain point 3) — bundled here since it shares the output contract

Give every palette tool an `inputs`/`outputs` line. Extend the tool descriptor from `{label, subtitle}` to `{label, subtitle, inputs, outputs}` and render a third line in the palette card (page.tsx:1886-1919). Source the I/O text from the executor contracts in §0's table (e.g. Walrus → in: `manifest/blob`, out: `blobId`; Sui → in: `movePackage+entry | passportId`, out: `txDigest`). Also wire the currently-decorative search box (page.tsx:1826) to filter tools by label/subtitle/inputs/outputs. Add the **Sui Skills catalog** as a read-only sub-section in the palette (links to `MystenLabs/skills`, install hint `npx skills add mystenlabs/skills --skill <name>`), clearly marked "reference / editor tooling — not an executable node," so we surface them (pain point 4) without falsely implying they run on-chain.

---

## Risks / call-outs
- Concurrency: the canvas page is being edited by other workflows — keep new logic in **new `lib/*` modules** (`node-output.ts`, `workflow-templates.ts`) so the page edit is a thin wiring change with minimal merge surface.
- Mainnet Walrus has no public publisher (walrus.ts:14) — templates using `walrus`/`harbor` should note "testnet" or rely on a configured publisher; the preflight already warns (page.tsx:1276).
- Sui Skills ≠ AgentOS SkillDescriptor — do not present them as runnable nodes.
- memwal exposes no namespace-list/stats endpoint — a "browse my memories" UI can only recall within a known namespace, not enumerate namespaces.
