/**
 * Per-node-type step executors for the workflow engine.
 *
 * Each executor is signer-agnostic: it receives the node, the injected
 * {@link RunContext}, and the results of all prior steps, and returns a
 * {@link StepExecutorResult}. On-chain work goes through `ctx.execute(tx)`;
 * the SDK never imports Enoki or reads sponsorship env here.
 */

import { Transaction } from "@mysten/sui/transactions";

import * as contracts from "../contracts/index.js";
import {
  PACKAGE_PLACEHOLDER,
  resolveMovePackageId,
} from "../contracts/package-id.js";
import { sealEncrypt } from "../seal.js";
import { isValidSuiNSName } from "../suins-resolve.js";
import { WalrusClient } from "../walrus.js";
import type {
  RunContext,
  StepResult,
  StepStatus,
  WorkflowNode,
  WorkflowNodeType,
} from "./types.js";

/** A Sui object/address id: `0x` followed by 1..=64 hex chars. */
const HEX_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

/** True when `value` is a concrete on-chain Sui address (`0x…hex`). */
function isSuiAddress(value: string | undefined): value is string {
  return typeof value === "string" && HEX_ADDRESS.test(value.trim());
}

/**
 * Decide whether the host has a REAL, published agentos Move package id to
 * target. `resolveMovePackageId` falls back to the MVR package NAME placeholder
 * (`@agentos/contracts`) when nothing is configured; @mysten/sui then needs an
 * MVR Api URL on the client to resolve a name → it aborts with a cryptic
 * "MVR Api URL is not set" error. We avoid that entirely: only a concrete
 * `0x…` package id counts as real. `ctx.packageId` wins; otherwise the env
 * fallback inside `resolveMovePackageId` applies.
 */
function hasRealPackageId(ctx: RunContext): boolean {
  const resolved = resolveMovePackageId(ctx.packageId);
  return resolved !== PACKAGE_PLACEHOLDER && isSuiAddress(resolved);
}

/** What an executor returns; {@link runWorkflow} folds this into a StepResult. */
export interface StepExecutorResult {
  status: StepStatus;
  output?: unknown;
  txDigest?: string;
  blobId?: string;
  error?: string;
}

/** A function that executes a single workflow node. */
export type StepExecutor = (
  node: WorkflowNode,
  ctx: RunContext,
  prevOutputs: StepResult[],
) => Promise<StepExecutorResult>;

/** Coerce an arbitrary payload to bytes for blob upload. */
function toBytes(payload: unknown): Uint8Array {
  if (payload instanceof Uint8Array) return payload;
  if (typeof payload === "string") return new TextEncoder().encode(payload);
  return new TextEncoder().encode(JSON.stringify(payload ?? {}));
}

/**
 * Choose the payload a storage node should persist: an explicit
 * `params.manifest` / `params.blob`, otherwise the run-level `ctx.params`.
 */
function pickPayload(node: WorkflowNode, ctx: RunContext): unknown {
  return (
    node.params?.manifest ??
    node.params?.blob ??
    ctx.params ??
    {}
  );
}

/** Parse a `package::module::function` (or `module::function`) entry target. */
function parseTarget(
  movePackage: string,
  entry: string,
): `${string}::${string}::${string}` {
  const parts = entry.split("::");
  if (parts.length === 3) {
    return `${parts[0]}::${parts[1]}::${parts[2]}`;
  }
  if (parts.length === 2) {
    return `${movePackage}::${parts[0]}::${parts[1]}`;
  }
  return `${movePackage}::main::${entry}`;
}

/** Trigger: a no-op start node that simply marks the chain as begun. */
const trigger: StepExecutor = async (node, ctx) => {
  return {
    status: "done",
    output: { started: true, params: node.params ?? ctx.params ?? {} },
  };
};

/** Walrus: store a manifest/blob and return its blobId. */
const walrus: StepExecutor = async (node, ctx) => {
  const payload = pickPayload(node, ctx);
  if (ctx.uploadManifest) {
    const { blobId } = await ctx.uploadManifest(payload);
    return { status: "done", blobId, output: { blobId } };
  }
  const client = new WalrusClient();
  const { blobId } = await client.uploadBlob(toBytes(payload));
  return { status: "done", blobId, output: { blobId } };
};

/**
 * Store the (already Seal-encrypted) ciphertext via the SAME working Walrus
 * upload the `walrus` executor uses: the host's generic `ctx.uploadManifest`
 * (Walrus-backed) when injected, otherwise a direct Walrus `PUT`. This is the
 * resilience net for the Harbor node — when the real Harbor API is unavailable
 * (or unconfigured) we still land the bytes on a Walrus publisher that is known
 * to work on this network, so the node ends DONE and Memory runs.
 */
async function storeEncryptedOnWalrus(
  ctx: RunContext,
  encrypted: Uint8Array,
  sealPolicyId: string,
): Promise<string | undefined> {
  if (ctx.uploadManifest) {
    const r = await ctx.uploadManifest({
      encrypted: Array.from(encrypted),
      sealPolicyId,
    });
    return r.blobId;
  }
  const r = await new WalrusClient().uploadBlob(encrypted);
  return r.blobId;
}

/**
 * Harbor: for private skills, Seal-encrypt the payload and store the ciphertext.
 * For public skills there is nothing to encrypt, so skip.
 *
 * Upload backend precedence (the node ends DONE on the FIRST that works):
 *   1. `ctx.harbor.upload` — the REAL Harbor API uploader injected by the host
 *      (HARBOR_API_KEY + HARBOR_SPACE_ID + HARBOR_BUCKET_ID). The encrypted blob
 *      lands in the user's Harbor bucket and we surface the real fileId + URL.
 *      If this THROWS (e.g. the Harbor endpoint 404s / the account is down) we
 *      DO NOT hard-error — we fall through to (2).
 *   2. Walrus fallback — the exact same working Walrus upload the `walrus`
 *      executor uses (`ctx.uploadManifest`, else a direct Walrus `PUT`). Returns
 *      `{ storage: "walrus", note: "stored on Walrus (Harbor API unavailable)" }`.
 *
 * Only when BOTH the Harbor API and the Walrus fallback genuinely fail does the
 * node error. When HARBOR_API_KEY is unset the host injects no `ctx.harbor`, so
 * a private skill goes straight to the Walrus fallback and never crashes.
 */
const harbor: StepExecutor = async (node, ctx) => {
  const isPrivate = Boolean(node.params?.private);
  if (!isPrivate) {
    return {
      status: "skipped",
      output: { note: "public skill — Seal encryption skipped" },
    };
  }

  const sealPolicyId =
    typeof node.params?.sealPolicyId === "string"
      ? node.params.sealPolicyId
      : typeof node.params?.private === "string"
        ? node.params.private
        : "";
  if (!sealPolicyId) {
    return {
      status: "error",
      error: "harbor node marked private but no sealPolicyId provided",
    };
  }

  // NOTE: sealEncrypt is the AES DEMO Seal envelope (see seal.ts). Swap for a
  // real Seal threshold-encrypt before production.
  const encrypted = await sealEncrypt(toBytes(pickPayload(node, ctx)), sealPolicyId);

  // 1. Real Harbor: store the ciphertext in the user's Walrus Harbor bucket.
  //    A Harbor-API failure (404/auth/outage) must NOT block the run — we catch
  //    it and fall back to the working Walrus upload below.
  let harborError: string | undefined;
  if (ctx.harbor) {
    const filename =
      strParam(node, "filename") ?? `${sealPolicyId}-${Date.now()}.seal`;
    try {
      const r = await ctx.harbor.upload(encrypted, filename);
      if (r.blobId) {
        return {
          status: "done",
          blobId: r.blobId,
          output: {
            blobId: r.blobId,
            sealPolicyId,
            encryptedBytes: encrypted.length,
            storage: "harbor",
            ...(r.fileId ? { fileId: r.fileId } : {}),
            ...(r.url ? { url: r.url } : {}),
          },
        };
      }
      // Harbor accepted the upload but returned no blob id → treat as a soft
      // failure and fall back to Walrus rather than surface an empty blob.
      harborError = "Harbor upload returned no blobId";
    } catch (err) {
      harborError = err instanceof Error ? err.message : String(err);
    }
  }

  // 2. Walrus fallback: the same working upload the `walrus` executor uses. This
  //    is the safety net that keeps the Harbor node DONE so Memory can run.
  try {
    const blobId = await storeEncryptedOnWalrus(ctx, encrypted, sealPolicyId);
    return {
      status: "done",
      blobId,
      output: {
        blobId,
        sealPolicyId,
        encryptedBytes: encrypted.length,
        storage: "walrus",
        ...(harborError
          ? { note: "stored on Walrus (Harbor API unavailable)", harborError }
          : {}),
      },
    };
  } catch (walrusErr) {
    // Only here do we genuinely error: BOTH Harbor and Walrus failed.
    const walrusMsg =
      walrusErr instanceof Error ? walrusErr.message : String(walrusErr);
    return {
      status: "error",
      error: harborError
        ? `Harbor upload failed (${harborError}); Walrus fallback also failed: ${walrusMsg}`
        : walrusMsg,
    };
  }
};

/**
 * Sui: build a `record_execution` PTB (when a passport id is known) — or a
 * generic skill move-call from `params.movePackage`/`params.entry` — and run it
 * through the injected `ctx.execute`. Returns the resulting tx digest.
 */
const sui: StepExecutor = async (node, ctx) => {
  const tx = new Transaction();
  const packageId =
    typeof node.params?.packageId === "string"
      ? node.params.packageId
      : undefined;
  const passportId =
    typeof node.params?.passportId === "string"
      ? node.params.passportId
      : ctx.passport?.id;

  const movePackage =
    typeof node.params?.movePackage === "string"
      ? node.params.movePackage
      : undefined;
  const entry =
    typeof node.params?.entry === "string" ? node.params.entry : undefined;

  if (movePackage && entry) {
    // A generic, user-supplied Move call. Only run it when the target package
    // is a concrete on-chain id; a bare MVR package NAME would make
    // @mysten/sui demand an MVR Api URL and hard-error. Skip gracefully.
    if (!isSuiAddress(movePackage)) {
      return {
        status: "skipped",
        output: {
          note: `Sui: skipped — move target package "${movePackage}" is not a published 0x package`,
        },
      };
    }
    tx.moveCall({ target: parseTarget(movePackage, entry), arguments: [] });
  } else if (passportId) {
    // record_execution targets the AgentOS package. With no published package
    // id configured, `resolveMovePackageId` falls back to the MVR placeholder
    // "@agentos/contracts" and @mysten/sui aborts with "MVR Api URL is not set".
    // Degrade to a clear skip instead of surfacing that cryptic error.
    if (!isSuiAddress(packageId) && !hasRealPackageId(ctx)) {
      return {
        status: "skipped",
        output: {
          note: "Sui: skipped — set NEXT_PUBLIC_AGENTOS_PACKAGE_ID to a published 0x package",
        },
      };
    }
    tx.add(
      contracts.agentPassport.recordExecution({
        passport: tx.object(passportId),
        packageId: isSuiAddress(packageId) ? packageId : ctx.packageId,
      }),
    );
  } else {
    return {
      status: "skipped",
      output: {
        note: "no passport id or move target — nothing to execute on-chain",
      },
    };
  }

  const result = await ctx.execute(tx);
  return {
    status: "done",
    txDigest: result.digest,
    output: { digest: result.digest, objectChanges: result.objectChanges },
  };
};

/** Read a node param as a string, or `undefined` when missing/non-string. */
function strParam(node: WorkflowNode, key: string): string | undefined {
  const v = node.params?.[key];
  return typeof v === "string" && v.length > 0 ? v : undefined;
}

/** Read a node param as a string[] (filtering non-strings), or `undefined`. */
function strArrayParam(node: WorkflowNode, key: string): string[] | undefined {
  const v = node.params?.[key];
  if (!Array.isArray(v)) return undefined;
  return v.filter((x): x is string => typeof x === "string");
}

/**
 * Scan a tx's `objectChanges` for a newly-created object whose type contains
 * `typeNeedle`, returning its object id. Tolerant of shape (sponsored execute
 * may return objectChanges as `unknown`).
 */
function createdObjectId(
  objectChanges: unknown,
  typeNeedle: string,
): string | undefined {
  if (!Array.isArray(objectChanges)) return undefined;
  for (const change of objectChanges as Array<Record<string, unknown>>) {
    if (
      change?.type === "created" &&
      typeof change.objectType === "string" &&
      change.objectType.includes(typeNeedle) &&
      typeof change.objectId === "string"
    ) {
      return change.objectId;
    }
  }
  return undefined;
}

/**
 * import-agent: READ-ONLY. Resolve a target `.sui` agent, gate that it is
 * active, then enumerate its published skills — downloading + hash-verifying
 * each manifest — and emit a catalog. NEVER executes anything on-chain.
 *
 * Params: `{ agent: "<name>.sui" }` (falls back to `ctx.params.importAgent`).
 */
const importAgent: StepExecutor = async (node, ctx) => {
  if (!ctx.resolve) {
    return {
      status: "error",
      error: "import-agent: ctx.resolve bundle not injected by host",
    };
  }
  const target =
    strParam(node, "agent") ??
    strParam(node, "name") ??
    (typeof ctx.params?.importAgent === "string"
      ? (ctx.params.importAgent as string)
      : undefined);
  if (!target) {
    return {
      status: "error",
      error: "import-agent: no target agent .sui name provided",
    };
  }

  const agent = await ctx.resolve.resolveAgent(target);
  if (agent.status && agent.status !== "active") {
    return {
      status: "error",
      error: `import-agent: agent ${target} is not active (status: ${agent.status})`,
    };
  }

  const skills = await ctx.resolve.listSkills(target);
  const catalog: Array<{
    skillId: string;
    name: string;
    version: string;
    manifestHash: string;
    verified: boolean;
    requiredCapabilities: string[];
    entry?: string;
    movePackage?: string;
    error?: string;
  }> = [];

  for (const skill of skills) {
    try {
      const manifest = await ctx.resolve.downloadManifest(
        skill.walrusManifestBlob,
        skill.manifestHash,
        skill.sealPolicyId ? { sealPolicyId: skill.sealPolicyId } : undefined,
      );
      catalog.push({
        skillId: skill.skillId,
        name: manifest.name,
        version: manifest.version || skill.version,
        manifestHash: skill.manifestHash,
        verified: true,
        requiredCapabilities:
          manifest.sui?.policyRequired ?? skill.requiredCapabilities ?? [],
        entry: manifest.sui?.entry,
        movePackage: manifest.sui?.movePackage,
      });
    } catch (err) {
      // Hash-verify (or download) failed — keep the entry but flag it.
      catalog.push({
        skillId: skill.skillId,
        name: skill.skillId,
        version: skill.version,
        manifestHash: skill.manifestHash,
        verified: false,
        requiredCapabilities: skill.requiredCapabilities ?? [],
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    status: "done",
    output: {
      agent: agent.suinsName ?? target,
      passportId: agent.id,
      runtimeWallet: agent.runtimeWallet,
      skillCount: catalog.length,
      catalog,
    },
  };
};

/**
 * Coerce an agent identifier (a `.sui` name OR a `0x…` address) to a concrete
 * Sui address. A bare `0x…` is returned as-is. A `.sui` name is resolved via the
 * injected `resolve.resolveAgentAddress` (then, as a fallback, the address-ish
 * fields on `resolve.resolveAgent`). Returns `null` when it cannot be resolved
 * to a `0x…` address — callers then SKIP gracefully rather than passing a
 * non-address string to `tx.pure.address` (which would hard-error).
 */
async function resolveToAddress(
  identifier: string,
  ctx: RunContext,
): Promise<string | null> {
  if (isSuiAddress(identifier)) return identifier;
  if (!isValidSuiNSName(identifier)) return null;
  const resolve = ctx.resolve;
  if (!resolve) return null;

  if (resolve.resolveAgentAddress) {
    const addr = await resolve.resolveAgentAddress(identifier);
    if (isSuiAddress(addr ?? undefined)) return addr as string;
  }
  // Fallback: pull an address-ish field off the resolved agent.
  try {
    const agent = await resolve.resolveAgent(identifier);
    const candidate = agent.runtimeWallet ?? agent.owner ?? agent.id;
    if (isSuiAddress(candidate)) return candidate;
  } catch {
    // resolveAgent throwing means "not resolvable" → fall through to null.
  }
  return null;
}

/**
 * delegate: grant a DelegationCap from the run's parent passport to a child
 * agent. Builds the grant PTB via the injected builder and commits it through
 * `ctx.execute`; reads the created cap id back out of `objectChanges`.
 *
 * Params: `{ child: "<addr|name>", allowedSkills?, allowedCapabilities?,
 *            spendLimit?, expiryMs?, parentPassportId? }`.
 *
 * Skips gracefully (no cryptic hard-error) when there is no published package
 * id, or when the child `.sui` name does not resolve to an on-chain address.
 */
const delegate: StepExecutor = async (node, ctx) => {
  if (!ctx.build) {
    return {
      status: "error",
      error: "delegate: ctx.build bundle not injected by host",
    };
  }
  const parentPassportId =
    strParam(node, "parentPassportId") ?? ctx.passport?.id;
  if (!parentPassportId) {
    return {
      status: "error",
      error: "delegate: no parent passport id (set params.parentPassportId or ctx.passport.id)",
    };
  }
  const childAgent = strParam(node, "child") ?? strParam(node, "childAgent");
  if (!childAgent) {
    return {
      status: "error",
      error: "delegate: no child agent address/name provided (params.child)",
    };
  }

  // The delegation module lives in the AgentOS package. With no published
  // package id, building the grant PTB would target the MVR placeholder and
  // hard-error. Skip with a clear note instead.
  if (!hasRealPackageId(ctx)) {
    return {
      status: "skipped",
      output: {
        note: `Delegate: skipped — no packageId (set NEXT_PUBLIC_AGENTOS_PACKAGE_ID to a published 0x package)`,
      },
    };
  }

  // Never pass a `.sui` NAME where a Sui ADDRESS is required: resolve it first.
  const childAddress = await resolveToAddress(childAgent, ctx);
  if (!childAddress) {
    return {
      status: "skipped",
      output: {
        note: `Delegate: skipped — ${childAgent} not resolvable on-chain (no passport/address)`,
      },
    };
  }

  const tx = ctx.build.buildDelegateTx({
    parentPassportId,
    childAgent: childAddress,
    allowedSkills: strArrayParam(node, "allowedSkills") ?? [],
    allowedCapabilities: strArrayParam(node, "allowedCapabilities") ?? [],
    spendLimit: BigInt(
      typeof node.params?.spendLimit === "number" ||
        typeof node.params?.spendLimit === "string"
        ? (node.params.spendLimit as number | string)
        : 0,
    ),
    expiryMs: BigInt(
      typeof node.params?.expiryMs === "number" ||
        typeof node.params?.expiryMs === "string"
        ? (node.params.expiryMs as number | string)
        : 0,
    ),
  });

  const result = await ctx.execute(tx);
  const capId = createdObjectId(
    result.objectChanges,
    "delegation::DelegationCap",
  );
  return {
    status: "done",
    txDigest: result.digest,
    output: {
      digest: result.digest,
      capId,
      childAgent: childAddress,
      ...(childAddress !== childAgent ? { childName: childAgent } : {}),
      parentPassportId,
    },
  };
};

/**
 * call-sub-agent: run a skill under a delegation. Builds the atomic PTB
 * (assert_valid → entry → consume → record_subagent_execution) via the injected
 * builder, then commits it through `ctx.execute`. Captures the tx digest.
 *
 * Params: `{ skill: "<name>.sui", delegationCapId, subjectPassportId, cost?,
 *            params?, agentCapabilities? }`.
 */
const callSubAgent: StepExecutor = async (node, ctx) => {
  if (!ctx.build) {
    return {
      status: "error",
      error: "call-sub-agent: ctx.build bundle not injected by host",
    };
  }
  const suinsName = strParam(node, "skill") ?? strParam(node, "suinsName");
  if (!suinsName) {
    return {
      status: "error",
      error: "call-sub-agent: no skill .sui name provided (params.skill)",
    };
  }

  // The delegated skill PTB binds against the AgentOS package. With no published
  // package id, skip gracefully rather than building a tx that hard-errors.
  if (!hasRealPackageId(ctx)) {
    return {
      status: "skipped",
      output: {
        note: `Call Sub-Agent: skipped — no packageId (set NEXT_PUBLIC_AGENTOS_PACKAGE_ID to a published 0x package)`,
      },
    };
  }

  const delegationCapId = strParam(node, "delegationCapId");
  const subjectPassportId =
    strParam(node, "subjectPassportId") ??
    (delegationCapId ? ctx.passport?.id : undefined);

  const built = await ctx.build.buildCallSubAgentTx({
    suinsName,
    ...(node.params?.params && typeof node.params.params === "object"
      ? { params: node.params.params as Record<string, unknown> }
      : ctx.params
        ? { params: ctx.params }
        : {}),
    ...(strArrayParam(node, "agentCapabilities")
      ? { agentCapabilities: strArrayParam(node, "agentCapabilities") }
      : {}),
    ...(delegationCapId ? { delegationCapId } : {}),
    ...(subjectPassportId ? { subjectPassportId } : {}),
    ...(typeof node.params?.cost === "number"
      ? { cost: node.params.cost }
      : typeof node.params?.cost === "string" && node.params.cost.length > 0
        ? { cost: Number(node.params.cost) }
        : {}),
  });

  const result = await ctx.execute(built.transaction);
  return {
    status: "done",
    txDigest: result.digest,
    output: {
      digest: result.digest,
      skill: suinsName,
      manifestHash: built.manifestHash,
      verified: built.verified,
      delegated: Boolean(delegationCapId),
    },
  };
};

/**
 * attest: write a reputation attestation about a subject agent. Builds the
 * attest PTB (which always transfers or shares the produced Attestation so the
 * PTB never dangles) via the injected builder, then commits via `ctx.execute`.
 *
 * Params: `{ subjectPassportId, kind, score, uri?, recipient? | share? }`.
 */
const attest: StepExecutor = async (node, ctx) => {
  if (!ctx.build) {
    return {
      status: "error",
      error: "attest: ctx.build bundle not injected by host",
    };
  }

  // The attestation module lives in the AgentOS package. With no published
  // package id this node cannot run on-chain — skip gracefully BEFORE the
  // config checks so a no-env run reports a clean skip (not a config error).
  if (!hasRealPackageId(ctx)) {
    return {
      status: "skipped",
      output: {
        note: `Attest: skipped — no packageId (set NEXT_PUBLIC_AGENTOS_PACKAGE_ID to a published 0x package)`,
      },
    };
  }

  const subjectPassportId =
    strParam(node, "subjectPassportId") ?? strParam(node, "subject");
  if (!subjectPassportId) {
    return {
      status: "error",
      error: "attest: no subjectPassportId provided",
    };
  }
  const kind = strParam(node, "kind") ?? "review";
  const scoreRaw = node.params?.score;
  const score =
    typeof scoreRaw === "number"
      ? scoreRaw
      : typeof scoreRaw === "string"
        ? Number(scoreRaw)
        : NaN;
  if (!Number.isFinite(score) || score < 0 || score > 100) {
    return {
      status: "error",
      error: `attest: score must be a number in 0..=100 (got ${String(scoreRaw)})`,
    };
  }
  const uri = strParam(node, "uri") ?? "";
  const recipient = strParam(node, "recipient");
  const share = Boolean(node.params?.share);
  if (!recipient && !share) {
    return {
      status: "error",
      error: "attest: requires either a `recipient` (transfer) or `share: true`",
    };
  }

  const tx = ctx.build.buildAttestTx({
    subjectPassportId,
    kind,
    score,
    uri,
    ...(recipient ? { recipient } : { share: true }),
  });

  const result = await ctx.execute(tx);
  return {
    status: "done",
    txDigest: result.digest,
    output: {
      digest: result.digest,
      subjectPassportId,
      kind,
      score,
      ...(recipient ? { recipient } : { shared: true }),
    },
  };
};

/**
 * Resolve the memory namespace for a node: an explicit `params.namespace`
 * wins, then the run's passport namespace, then the agent's `.sui` name.
 */
function memoryNamespace(node: WorkflowNode, ctx: RunContext): string {
  return (
    strParam(node, "namespace") ||
    ctx.passport?.memoryNamespace ||
    ctx.agentName
  );
}

/**
 * Tolerantly pull a Walrus blob id out of a memwal `remember` response. The
 * relayer may surface it at the top level or nested under a `result`/`data`
 * envelope, under any of a few common keys. Returns `undefined` when none is
 * present (the step still reports `done` — the write succeeded regardless).
 */
function extractBlobId(value: unknown): string | undefined {
  const keys = ["blobId", "blob_id", "blob", "id"];
  const seen = new Set<unknown>();
  const visit = (v: unknown, depth: number): string | undefined => {
    if (depth > 3 || typeof v !== "object" || v === null || seen.has(v)) {
      return undefined;
    }
    seen.add(v);
    const rec = v as Record<string, unknown>;
    for (const k of keys) {
      const candidate = rec[k];
      // Avoid mistaking a short numeric "id" for a blob id; blob ids are long.
      if (
        typeof candidate === "string" &&
        candidate.length > 0 &&
        (k !== "id" || candidate.length >= 20)
      ) {
        return candidate;
      }
    }
    for (const nested of ["result", "data", "memory"]) {
      const found = visit(rec[nested], depth + 1);
      if (found) return found;
    }
    return undefined;
  };
  return visit(value, 0);
}

/**
 * Build the text a memory node should remember. Precedence:
 *   1. an explicit `params.text` string,
 *   2. a `params.template` with `{{nodeId}}` / `{{nodeId.field}}` placeholders
 *      filled from prior step outputs,
 *   3. otherwise a compact one-line digest of the prior steps (node:status,
 *      blob/tx when present) — NOT a lossy JSON.stringify dump of everything.
 */
function buildMemoryText(node: WorkflowNode, prevOutputs: StepResult[]): string {
  const explicit = strParam(node, "text");
  if (explicit) return explicit;

  const template = strParam(node, "template");
  if (template) {
    return template.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_m, expr: string) => {
      const [nodeId, field] = String(expr).split(".");
      const step = prevOutputs.find((s) => s.nodeId === nodeId);
      if (!step) return "";
      if (!field) {
        if (step.txDigest) return step.txDigest;
        if (step.blobId) return step.blobId;
        return typeof step.output === "string"
          ? step.output
          : JSON.stringify(step.output ?? null);
      }
      const out = step.output;
      if (out && typeof out === "object" && field in (out as object)) {
        const v = (out as Record<string, unknown>)[field];
        return typeof v === "string" ? v : JSON.stringify(v ?? null);
      }
      if (field === "txDigest" && step.txDigest) return step.txDigest;
      if (field === "blobId" && step.blobId) return step.blobId;
      return "";
    });
  }

  // Default: a readable, non-lossy summary line (not a giant JSON dump).
  const parts = prevOutputs
    .filter((s) => s.status === "done")
    .map((s) => {
      if (s.txDigest) return `${s.nodeId}: tx ${s.txDigest}`;
      if (s.blobId) return `${s.nodeId}: blob ${s.blobId}`;
      return `${s.nodeId}: ${s.status}`;
    });
  return parts.length > 0 ? parts.join("; ") : "workflow run";
}

/**
 * Memory (remember): persist a memory into the agent's namespace and report the
 * real, synchronous Walrus blob id it landed in. The remembered text is an
 * explicit `params.text` / templated `params.template`, otherwise a compact
 * digest of prior steps — NOT a JSON.stringify dump of every prior output.
 * Skipped (not failed) when no memory backend is wired.
 */
const memory: StepExecutor = async (node, ctx, prevOutputs) => {
  if (!ctx.memory) {
    return { status: "skipped", output: { note: "memwal not configured" } };
  }
  const namespace = memoryNamespace(node, ctx);
  const text = buildMemoryText(node, prevOutputs);
  const result = await ctx.memory.remember(namespace, text);
  const blobId = extractBlobId(result);
  return {
    status: "done",
    ...(blobId ? { blobId } : {}),
    output: { namespace, text, ...(blobId ? { blobId } : {}) },
  };
};

/**
 * Memory recall: semantic-search the agent's memory namespace and pull the
 * ranked matches INTO the graph so downstream nodes (and the canvas) can read
 * them. Skipped (not failed) when no memory backend is wired.
 *
 * Params: `{ namespace?, query, limit? }` (namespace falls back to the run's
 * passport namespace / agent name; query falls back to `ctx.params.query`).
 * Output: `{ namespace, query, total, results: [{ text, score, blobId }] }`
 * where `score = 1 - distance` (higher is closer).
 */
const memoryRecall: StepExecutor = async (node, ctx, _prevOutputs) => {
  if (!ctx.memory) {
    return { status: "skipped", output: { note: "memwal not configured" } };
  }
  const namespace = memoryNamespace(node, ctx);
  const query =
    strParam(node, "query") ??
    (typeof ctx.params?.query === "string" ? ctx.params.query : undefined);
  if (!query) {
    return {
      status: "error",
      error: "memory-recall: no query provided (params.query)",
    };
  }
  const limitRaw = node.params?.limit;
  const limit =
    typeof limitRaw === "number"
      ? limitRaw
      : typeof limitRaw === "string" && limitRaw.trim().length > 0
        ? Number(limitRaw)
        : undefined;

  const raw = await ctx.memory.recall(
    namespace,
    query,
    Number.isFinite(limit) ? (limit as number) : undefined,
  );
  const results = normalizeRecall(raw);
  return {
    status: "done",
    output: { namespace, query, total: results.length, results },
  };
};

/** A single ranked recall hit pulled into the graph. */
interface RecallHit {
  text: string;
  score?: number;
  blobId?: string;
}

/**
 * Normalise a memwal `recall` response into ranked hits. Tolerant of the
 * relayer's exact shape: accepts `{ results | memories | matches: [...] }` (or a
 * bare array), and per-hit `{ text|memory|content, distance|score, blobId }`.
 * `score = 1 - distance` when a distance is given (clamped to 0..1).
 */
function normalizeRecall(raw: unknown): RecallHit[] {
  const arr = Array.isArray(raw)
    ? raw
    : raw && typeof raw === "object"
      ? ((raw as Record<string, unknown>).results ??
        (raw as Record<string, unknown>).memories ??
        (raw as Record<string, unknown>).matches)
      : undefined;
  if (!Array.isArray(arr)) return [];

  const hits: RecallHit[] = [];
  for (const item of arr) {
    if (typeof item === "string") {
      hits.push({ text: item });
      continue;
    }
    if (!item || typeof item !== "object") continue;
    const rec = item as Record<string, unknown>;
    const text =
      typeof rec.text === "string"
        ? rec.text
        : typeof rec.memory === "string"
          ? rec.memory
          : typeof rec.content === "string"
            ? rec.content
            : typeof rec.value === "string"
              ? rec.value
              : undefined;
    if (text === undefined) continue;

    let score: number | undefined;
    if (typeof rec.score === "number" && Number.isFinite(rec.score)) {
      score = rec.score;
    } else if (
      typeof rec.distance === "number" &&
      Number.isFinite(rec.distance)
    ) {
      score = Math.max(0, Math.min(1, 1 - rec.distance));
    }
    const blobId = extractBlobId(rec);
    hits.push({
      text,
      ...(score !== undefined ? { score } : {}),
      ...(blobId ? { blobId } : {}),
    });
  }
  return hits;
}

/** Registry of executors keyed by node type. */
export const executors: Record<WorkflowNodeType, StepExecutor> = {
  trigger,
  walrus,
  harbor,
  sui,
  memory,
  "memory-recall": memoryRecall,
  "import-agent": importAgent,
  delegate,
  "call-sub-agent": callSubAgent,
  attest,
};
