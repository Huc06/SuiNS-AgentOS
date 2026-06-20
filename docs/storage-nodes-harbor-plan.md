# Storage Nodes (Walrus + Harbor + Seal) — Feature Plan

> Research + plan only. Decision-ready. Does NOT edit source — other workflows touch
> `executors.ts` / `types.ts` / the canvas concurrently. This doc proposes the node
> contracts (inputs + the OUTPUT the canvas should render) so editing can land cleanly.

## 0. TL;DR — what to build

The current storage surface is **two thin nodes** (`walrus` = upload, `harbor` = Seal-encrypt-then-upload)
and a Seal layer that is an AES stand-in. Both nodes return almost nothing the canvas can show
beyond `blobId`. This plan proposes **8 richer storage/security nodes** plus the one piece of
infrastructure they all depend on: **landing real Harbor + real Seal** (today both degrade to plaintext).

| New node | One-liner | Backing API today |
|----------|-----------|-------------------|
| `bucket-provision` | reserve → sign → finalize a Harbor space/bucket for an agent | Harbor (auth) — **needs build** |
| `file-catalog` | list / search files in a bucket | Harbor `GET .../files` — **needs build** |
| `blob-status` | poll a blob's availability + epochs-remaining | Walrus aggregator `GET /v1/blobs/{id}` + Sui blob object |
| `blob-renew` | extend a blob's storage by N epochs | Sui PTB on Walrus system object (`extend`) — **needs build** |
| `quota-guard` | read space usage and branch when near limit | Harbor space usage — **needs build** |
| `seal-grant` / `seal-revoke` | grant/revoke scoped decryption to another agent | `BucketPolicy` + Seal — **needs Seal land** |
| `encrypted-retrieve` | download + Seal-decrypt a private blob with membership proof | Walrus/Harbor download + `sealDecrypt` |

The biggest single dependency, and itself a headline feature, is **"Real Harbor + Real Seal"**
(section 4): `seal.ts` is local AES-GCM (file header says so, lines 1–29), the `harbor` executor
silently `skipped`s public skills and never touches Harbor, and `client.createSkillBucket()`
literally `throw new Error("Not implemented")` (client.ts:1166). Until that lands, every node
above degrades to Walrus-plaintext.

---

## 1. What exists today (grounding)

### 1.1 SDK storage clients
- **`walrus.ts`** — `WalrusClient`: `uploadBlob(bytes, {epochs, permanent})` → `PUT {publisher}/v1/blobs?epochs=&permanent=`; `downloadBlob(blobId)` → `GET {aggregator}/v1/blobs/{blobId}`. Default testnet publisher/aggregator, **unauthenticated**. No status/list/renew methods.
- **`harbor.ts`** — `HarborClient`: `uploadBlob(spaceId, bucketId, bytes, filename)` → `POST /api/v1/spaces/{spaceId}/buckets/{bucketId}/files` (Bearer `hbr_…`); `downloadBlob(blobId)` → `GET /api/v1/blobs/{blobId}`. Base `https://api.testnet.harbor.walrus.xyz`. **Only upload+download — no bucket create, list, quota, or grant.**
- **`seal.ts`** — local AES-256-GCM envelope (`SEAL_MAGIC = "AOSEAL1"`). `sealEncrypt(data, policyId)` / `sealDecrypt(data, policyId, proof)`. Membership is a deterministic hash, not real sui-groups. The header (lines 1–29) explicitly flags this as a fallback until `@mysten/seal` is wired.
- **`client.ts`** — `storageBackend: "walrus" | "harbor"` (Harbor auto-selected only when `harborApiKey` is supplied). `uploadManifest` does Seal-encrypt → upload; `downloadManifest` does download → Seal-decrypt → **hash-verify**. `createSkillBucket()` is unimplemented.

### 1.2 Workflow executors (the two storage nodes today)
- **`walrus`** executor (executors.ts:83): picks payload (`params.manifest`/`params.blob`/`ctx.params`), uploads, returns `{ status:"done", blobId, output:{ blobId } }`. **Output = just the blobId.**
- **`harbor`** executor (executors.ts:98): if `!params.private` → `status:"skipped"` ("public skill — Seal encryption skipped"); if private → `sealEncrypt` then upload, returns `{ blobId, sealPolicyId, encryptedBytes }`. **This is the #2 pain point**: a "Harbor" tile that does nothing for public skills and only ever AES-encrypts.

### 1.3 Contract
- **`bucket_policy.move`** — `BucketPolicy { owner, seal_policy_id }`, `seal_approve(id, policy, ctx)` asserts `policy.owner == sender`, `create(seal_policy_id)`. This is the on-chain gate Seal calls — currently only self-owner can decrypt; **no per-grantee allow-list** (that's the gap `seal-grant` exposes).

### 1.4 Canvas
- Node tiles render a Walruscan link when `data.blobId` is present (page.tsx:537–545, `walruscanBlobUrl`). Status badge done/error only. There is **no place to surface a file list, usage %, epochs-remaining, decrypted bytes, or a grant id** — these need new output renderers (handled by the canvas/output workflow; this doc only specifies the payload shape).

---

## 2. Real upstream API capabilities (verified this session)

### 2.1 Walrus aggregator (read) — `aggregator.walrus-testnet.walrus.space`, OpenAPI v1.50.0 live at `/v1/api`
Enumerated paths:
- `GET /v1/blobs/{blob_id}` — raw bytes (what we use).
- `GET /v1/blobs/{blob_id}/byte-range` — **partial reads** (range header) — useful for large catalog files.
- `GET /v1/blobs/by-object-id/{blob_object_id}` — fetch by Sui object id **+ returns attribute headers** from the blob object's metadata (powers `blob-status` attributes).
- `GET /v1/blobs/by-quilt-id/{quilt_id}/{identifier}` and `GET /v1/blobs/by-quilt-patch-id/{quilt_patch_id}` — read a single file out of a **quilt** (batched small files).
- `GET /v1/quilts/{quilt_id}/patches` — **list the files inside a quilt** (directly powers `file-catalog` on the Walrus side, no Harbor needed).
- `POST /v1alpha/blobs/concat` — concatenate blobs (large-file delivery).

### 2.2 Walrus publisher (write) — `publisher.walrus-testnet.walrus.space`, OpenAPI live
- `PUT /v1/blobs` — params: **`epochs`, `permanent`, `deletable`, `encoding_type`** (we currently only send `epochs`/`permanent`; `deletable` matters for renewable/cleanable agent scratch storage).
- `PUT /v1/quilts` — batch-store many small files as one quilt (one cert, cheaper). **Quilt is the right primitive for an agent that writes many small memory/log blobs.**

### 2.3 Blob status & renew are on-chain, not HTTP
- **Availability + epochs-remaining**: a blob is a **Sui object** (`Blob` in the Walrus system package) with `storage.end_epoch`. `blob-status` reads it via `suiClient.getObject(blobObjectId)` (or aggregator `by-object-id` for attributes) + the current epoch from the Walrus **system object**. There is no "GET /status" HTTP endpoint — availability = "the certified Sui blob object exists and `end_epoch > currentEpoch`".
- **Renew/extend**: `walrus extend --blob-obj-id <id> --epochs-extended N` under the hood buys storage from the system object and calls the system `extend` entry. `blob-renew` builds that PTB and runs it through `ctx.execute` (the agent's runtime wallet pays WAL/SUI).

### 2.4 Harbor (`api.testnet.harbor.walrus.xyz`) — authenticated, no public OpenAPI
Probed: base `/` → 404, `/api/v1/api` → `{"error":"Authentication required","code":"unauthorized"}` — i.e. it **requires `hbr_` Bearer** and we cannot enumerate it unauthenticated. From the code we already use `spaces/{spaceId}/buckets/{bucketId}/files` (upload) and `blobs/{blobId}` (download). Harbor = a **Tusky-style** ([walrus.xyz/blog/tusky](https://www.walrus.xyz/blog/tusky-storage-solution-walrus)) vault gateway: spaces → buckets → files, end-to-end Seal encryption, on-chain scoped grants. The bucket/list/quota/grant endpoints almost certainly exist but **must be confirmed against the live key during implementation** (probe `/api/v1/spaces`, `/api/v1/spaces/{id}` for usage, `/api/v1/spaces/{id}/buckets`, `…/files`, and a grants/permissions sub-resource). Treat exact Harbor paths in section 3 as **proposed-pending-probe**.

### 2.5 Seal (real)
`@mysten/seal` is installed (v0.1.0) but unused; threshold encryption needs a live KeyServer set + a signed `SessionKey` (seal.ts header). Real Seal = encrypt to a `packageId::id` identity gated by `bucket_policy::seal_approve`; decrypt fetches shares from key servers after a signed session. Landing this is section 4.

---

## 3. Proposed nodes — inputs and the OUTPUT the canvas shows

All outputs are the `StepResult.output` payload. Convention: every storage node SHOULD return a
small typed object the canvas can render as a labelled mini-table, plus set `blobId`/`txDigest` when
applicable so the existing Walruscan/Suiscan link logic keeps working.

### 3.1 `bucket-provision` — reserve → sign → finalize a Harbor bucket
- **Inputs**: `{ space?: string (default agent's), bucketName: string, sealPolicyId?: string, private?: boolean }`.
- **Flow**: (a) Harbor reserve/create-bucket call; (b) if private, `bucket_policy::create(sealPolicyId)` PTB via `ctx.execute` to mint the `BucketPolicy` gate; (c) finalize/register the bucket id with the agent.
- **OUTPUT canvas shows**: `{ spaceId, bucketId, bucketName, sealed: bool, bucketPolicyId?, sealPolicyId?, createdAtEpoch }` → render as "Bucket `xxxx` created in space `yyyy`, sealed ✔, policy `0x…`". Set `txDigest` from the policy-create PTB.
- **Backing**: Harbor (needs build) + `bucket_policy.move` (exists). Replaces the `createSkillBucket(): throw "Not implemented"` stub.

### 3.2 `file-catalog` — list / search files in a bucket (or quilt)
- **Inputs**: `{ bucketId?: string, quiltId?: string, query?: string, limit?: number }`.
- **Flow**: Harbor `GET /api/v1/spaces/{spaceId}/buckets/{bucketId}/files` (proposed-pending-probe) OR Walrus `GET /v1/quilts/{quiltId}/patches` for quilt-backed catalogs; client-side filter by `query`.
- **OUTPUT**: `{ source:"harbor"|"quilt", count, files:[{ name, blobId, size, contentType, updatedAtEpoch, sealed }] }` → render as a scrollable file table; each row's `blobId` links to Walruscan. **This directly fixes pain-point #1 for storage**: the catalog is now visible, not just a status dot.
- **Backing**: Walrus quilt-patches (exists, no auth) is the cheapest first cut; Harbor file-list (needs probe).

### 3.3 `blob-status` — poll availability + epochs remaining
- **Inputs**: `{ blobId?: string, blobObjectId?: string }` (falls back to a prior step's `blobId`).
- **Flow**: `getObject(blobObjectId)` for `storage.end_epoch` + Walrus system object for `currentEpoch`; or aggregator `GET /v1/blobs/by-object-id/{id}` for attribute headers; HEAD/GET the aggregator to confirm reconstructable.
- **OUTPUT**: `{ blobId, available: bool, certified: bool, currentEpoch, endEpoch, epochsRemaining, expiresAtApprox, sizeBytes, attributes?: Record<string,string> }` → render as "Available ✔ · 7 epochs left · ~14 days". `epochsRemaining` drives a yellow/red badge.
- **Backing**: Walrus aggregator (exists) + Sui object read (exists via `ctx.client`).

### 3.4 `blob-renew` — extend storage epochs
- **Inputs**: `{ blobObjectId: string, epochsExtended: number }`.
- **Flow**: build the Walrus system `extend` PTB (buy storage for N epochs + extend the blob object), run via `ctx.execute`.
- **OUTPUT**: `{ blobObjectId, previousEndEpoch, newEndEpoch, epochsExtended, digest }` → "Extended +3 epochs → end_epoch 218". Set `txDigest`.
- **Backing**: Sui PTB on Walrus system object (needs build — wrap `walrus extend` semantics in a PTB builder, ideally injected via `ctx.build` like the other PTB builders to keep the executor signer-agnostic).

### 3.5 `quota-guard` — usage check + branch
- **Inputs**: `{ spaceId?: string, warnAtPct?: number (default 80), failAtPct?: number (default 100) }`.
- **Flow**: Harbor space-usage read (proposed-pending-probe, e.g. `GET /api/v1/spaces/{id}`); compute `usedBytes/limitBytes`.
- **OUTPUT**: `{ spaceId, usedBytes, limitBytes, usedPct, status:"ok"|"warn"|"over" }`. Step `status` = `done` when ok/warn, **`error`** when over (so downstream upload nodes are gated). Render a usage bar.
- **Backing**: Harbor (needs probe). Fallback when Harbor absent: `status:"skipped"` with a note (mirror the memory executor's skip pattern) so Walrus-only runs don't break.

### 3.6 `seal-grant` / `seal-revoke` — scoped decryption grants
- **Inputs (`seal-grant`)**: `{ bucketPolicyId: string, grantee: "<addr|name>", scope?: string[], expiryMs?: number }`.
- **Inputs (`seal-revoke`)**: `{ bucketPolicyId: string, grantee: string }`.
- **Flow**: extend `bucket_policy.move` to hold an allow-list (today it's owner-only — see gap in 1.3) and add `grant(policy, grantee, …)` / `revoke(policy, grantee)`; the node builds + executes that PTB. With real Seal, the grantee can then fetch key-server shares.
- **OUTPUT**: `{ bucketPolicyId, grantee, scope, action:"grant"|"revoke", expiresAt?, digest }` → "Granted decrypt to `agent.sui` (skills: x,y) · expires …". Set `txDigest`.
- **Backing**: `bucket_policy.move` (needs an allow-list extension) + real Seal (section 4). This is the agent-coordination story Walrus markets (scoped on-chain grants).

### 3.7 `encrypted-retrieve` — download + Seal-decrypt a private blob
- **Inputs**: `{ blobId: string, sealPolicyId: string, membershipProof?: string }` (proof optional once real Seal derives it from the signed session).
- **Flow**: download (Walrus aggregator or Harbor) → `sealDecrypt` → optionally JSON-parse.
- **OUTPUT**: `{ blobId, sealPolicyId, decryptedBytes, preview, parsed?, verified: bool }` (truncate `preview` to e.g. 512 chars; never dump secrets in full). On access-denied: `status:"error"` with the `"Access denied: not a member of group …"` message surfaced as `cause`.
- **Backing**: download (exists) + `sealDecrypt` (exists as AES; real once section 4 lands).

---

## 4. Prerequisite feature: land REAL Harbor + REAL Seal

This is its own deliverable and a strong demo headline ("private agent memory, actually encrypted &
on-chain-gated"). Without it, 3.1/3.5/3.6/3.7 are theatre.

1. **Harbor client surface** — add `createBucket`, `listFiles`, `getSpaceUsage`, `grant/revoke` to `HarborClient` after probing the authenticated API with a real `hbr_` key. Implement `client.createSkillBucket()` (currently throws). Keep Walrus as the no-auth default; Harbor opt-in via `harborApiKey`.
2. **Real Seal** — swap `seal.ts` bodies to `@mysten/seal`: encrypt to `bucket_policy` identity, decrypt via a signed `SessionKey` + key-server shares. The header promises the **signatures stay stable** (`sealEncrypt`/`sealDecrypt`), so callers don't change. Gate behind a config flag so tests keep the AES fallback.
3. **`bucket_policy.move` allow-list** — add a `grantees` table + `grant`/`revoke` + make `seal_approve` accept owner OR an unexpired grantee. (Concurrent-edit caution: this is a contract change; coordinate with whoever owns `packages/contracts`.)
4. **Honest `harbor` node** — stop returning `skipped` for public skills; instead public → store in the named bucket (un-sealed), private → seal+store. Make the canvas badge say "Stored (public)" vs "Sealed + stored".

---

## 5. Template workflows that show storage outputs (ties to pain-point #5)

These give the canvas real outputs to render and double as ready-to-run templates:
- **"Publish a private skill"**: `trigger → bucket-provision(private) → harbor(seal+store) → blob-status → sui(record)` — shows bucketId, sealed blobId, epochs-remaining.
- **"Archive & verify"**: `trigger → walrus(store) → blob-status → blob-renew(+5) → blob-status` — visibly extends end_epoch.
- **"Storage hygiene"**: `trigger → quota-guard(80%) → file-catalog → (branch) blob-renew` — usage bar + file table.
- **"Share private memory"**: `bucket-provision(private) → harbor → seal-grant(other.sui) → import-agent(other) → encrypted-retrieve` — shows the grant id then the other agent decrypting.

---

## 6. Risks / call-outs

- **Harbor paths in §3 are proposed-pending-probe** — only upload/download are code-verified. First implementation task: probe the live authenticated Harbor API and pin the bucket/list/usage/grant routes. Do **not** print the `hbr_` key.
- **Seal is AES today** — `seal-grant`/`encrypted-retrieve` give a real UX but only real privacy after §4. Label the UI accordingly ("dev encryption") until then to avoid over-claiming.
- **`blob-renew` costs gas/WAL** — it's a real on-chain spend by the agent wallet; gate it behind explicit node params, not a default.
- **Keep executors signer-agnostic** — `blob-renew` and `seal-grant` build PTBs; inject their builders via the existing `ctx.build` bundle pattern (types.ts:185) rather than importing signing into the executor.
- **No public mainnet publisher** (walrus.ts:14–16) — these nodes are testnet-first; mainnet needs an authenticated publisher / Upload Relay.
