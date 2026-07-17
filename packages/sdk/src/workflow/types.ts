/**
 * Workflow engine types.
 *
 * A workflow is a small DAG of nodes (the node kinds rendered in the dashboard
 * editor) connected by edges. The engine ({@link ./run.ts}) topo-sorts the
 * nodes and runs one {@link ./executors.ts} StepExecutor per node, threading a
 * {@link RunContext}.
 *
 * The SDK side is **signer-agnostic**: it never imports Enoki or reads env.
 * Whoever runs the workflow (e.g. a Next.js API route) injects an
 * `execute(tx)` function (gas sponsorship / signing lives there) plus the
 * storage/memory helpers, the read-only `resolve` bundle, and the unsigned-PTB
 * `build` bundle. On-chain commits ALWAYS go through `execute` — the resolve
 * and build helpers never sign or submit anything.
 */

/**
 * The node kinds supported by the editor canvas:
 * - storage / security / memory: `walrus`, `harbor`, `memory` (remember),
 *   `memory-recall` (semantic recall — pulls memories INTO the graph)
 * - blockchain: `sui`
 * - triggers: `trigger`
 * - coordinate (multi-agent): `import-agent` (read-only catalog),
 *   `delegate` (grant a DelegationCap), `call-sub-agent` (delegated atomic
 *   skill execution), `attest` (write a reputation attestation).
 */
export type WorkflowNodeType =
  | "trigger"
  | "walrus"
  | "harbor"
  | "sui"
  | "memory"
  | "memory-recall"
  | "import-agent"
  | "call-sub-agent"
  | "delegate"
  | "attest";

/** A single node in the workflow graph. */
export interface WorkflowNode {
  id: string;
  type: WorkflowNodeType;
  label: string;
  params?: Record<string, unknown>;
}

/** A directed edge `source -> target` between two node ids. */
export interface WorkflowEdge {
  source: string;
  target: string;
}

/** The full workflow graph: nodes + edges. */
export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

/** Lifecycle status of a single step. */
export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

/** The result of executing a single node. */
export interface StepResult {
  nodeId: string;
  type: WorkflowNodeType;
  status: StepStatus;
  output?: unknown;
  txDigest?: string;
  blobId?: string;
  /** Raw error message (kept for back-compat). */
  error?: string;
  /**
   * Stable classification of the error/skip (see {@link ./diagnose.ts}
   * `StepErrorCode`). Set by the engine for errored/skipped steps.
   */
  errorCode?: string;
  /** Short, human-readable hint derived from the raw error. */
  errorHint?: string;
  /** One-line explanation of WHY the step errored/skipped. */
  cause?: string;
  /** One-line, actionable remediation. */
  remediation?: string;
}

/**
 * A resolved agent passport (subset of the SDK `AgentPassport`) returned by
 * the injected `resolve.resolveAgent`. Kept structural to avoid coupling the
 * workflow types to the full client type graph.
 */
export interface ResolvedAgent {
  id?: string;
  suinsName?: string;
  runtimeWallet?: string;
  owner?: string;
  /** "active" gates the agent as runnable; anything else is treated as inactive. */
  status?: string;
}

/** A resolved skill descriptor (subset) returned by `resolve.resolveSkill`/`listSkills`. */
export interface ResolvedSkill {
  skillId: string;
  walrusManifestBlob: string;
  manifestHash: string;
  version: string;
  requiredCapabilities: string[];
  dependencies?: string[];
  sealPolicyId?: string;
}

/** A downloaded + hash-verified skill manifest (subset) returned by `resolve.downloadManifest`. */
export interface ResolvedManifest {
  name: string;
  version: string;
  sui: {
    movePackage: string;
    entry: string;
    policyRequired: string[];
  };
  dependencies?: string[];
}

/**
 * Read-only resolver bundle injected by the host. Every member is a pure read
 * (chain-first, registry fallback inside the SDK client) — none of them sign or
 * submit a transaction. The coordinate executors use this to look up other
 * agents/skills before delegating to / calling them.
 */
export interface RunResolveBundle {
  resolveAgent: (suinsName: string) => Promise<ResolvedAgent>;
  resolveSkill: (
    suinsNameOrSkillId: string,
    agentName?: string,
  ) => Promise<ResolvedSkill>;
  listSkills: (agentName: string) => Promise<ResolvedSkill[]>;
  downloadManifest: (
    blobId: string,
    expectedHash: string,
    options?: { sealPolicyId?: string },
  ) => Promise<ResolvedManifest>;
  /**
   * Resolve a `.sui` name to its on-chain Sui address (0x…), or `null` when the
   * name is not registered on-chain. Used by the coordinate executors so a
   * `.sui` name is never passed where a Sui ADDRESS is required (e.g.
   * `tx.pure.address` / a DelegationCap's child). Optional so older hosts/tests
   * that don't inject it still type-check; when absent (or returns `null`) the
   * executor treats an unresolved name as a graceful skip.
   */
  resolveAgentAddress?: (suinsName: string) => Promise<string | null>;
}

/** Options for the injected delegated-skill PTB builder. */
export interface BuildCallSubAgentOptions {
  suinsName: string;
  params?: Record<string, unknown>;
  agentCapabilities?: string[];
  delegationCapId?: string;
  cost?: bigint | number;
  subjectPassportId?: string;
}

/** Result of the injected delegated-skill PTB builder (an unsigned Transaction). */
export interface BuildCallSubAgentResult {
  /** The unsigned PTB, ready to hand to `ctx.execute`. Typed `unknown` to avoid coupling. */
  transaction: unknown;
  manifestHash: string;
  verified: boolean;
  /**
   * False when the requested skill did NOT resolve (a saved canvas graph passed
   * the agent name instead of a real skill). In that case the PTB carries only
   * the delegation accounting — no skill move-call. `undefined`/true means the
   * skill resolved normally. Lets the executor surface a clear degraded note.
   */
  skillResolved?: boolean;
}

/** Options for the injected delegation-grant PTB builder. */
export interface BuildDelegateOptions {
  parentPassportId: string;
  childAgent: string;
  allowedSkills: string[];
  allowedCapabilities: string[];
  spendLimit: bigint | number;
  expiryMs: bigint | number;
}

/** Options for the injected attestation PTB builder. */
export interface BuildAttestOptions {
  subjectPassportId: string;
  kind: string;
  score: number;
  uri: string;
  /** Address to receive the produced Attestation. Mutually exclusive with `share`. */
  recipient?: string;
  /** When true (and no `recipient`), share the Attestation instead of transferring it. */
  share?: boolean;
}

/**
 * Unsigned-PTB builder bundle injected by the host. Each member returns a
 * built-but-unsigned transaction (plus metadata); the executor then commits it
 * via `ctx.execute`. Nothing here signs or submits — that stays in `execute`.
 */
export interface RunBuildBundle {
  /** Build the delegated atomic skill PTB (assert_valid → entry → consume → record). */
  buildCallSubAgentTx: (
    options: BuildCallSubAgentOptions,
  ) => Promise<BuildCallSubAgentResult>;
  /** Build a `delegation::grant` PTB returning a DelegationCap (transferred to the child). */
  buildDelegateTx: (options: BuildDelegateOptions) => unknown;
  /** Build an `attestation::attest` PTB (transfers or shares the produced Attestation). */
  buildAttestTx: (options: BuildAttestOptions) => unknown;
}

/**
 * Everything an executor needs to run, injected by the host (CLI / API route).
 *
 * `execute` is the only on-chain primitive: it accepts a built transaction and
 * returns its digest (the host handles signing + gas sponsorship). The SDK
 * itself stays free of Enoki/env coupling.
 *
 * `resolve` (read-only) and `build` (unsigned PTBs) are injected by the host so
 * the coordinate executors can look up + build for other agents/skills WITHOUT
 * the workflow engine taking a hard dependency on `AgentOSClient`. On-chain
 * commits still flow exclusively through `execute`.
 */
export interface RunContext {
  agentName: string;
  passport?: {
    id?: string;
    suinsName?: string;
    memoryNamespace?: string;
  };
  params?: Record<string, unknown>;
  /**
   * The AgentOS Move package id the host has configured (from
   * `NEXT_PUBLIC_AGENTOS_PACKAGE_ID` / `AGENTOS_PACKAGE_ID`). Absent (or an MVR
   * package NAME placeholder, or a non-`0x` string) means there is no published
   * package on this network — the on-chain executors that target the agentos
   * package then SKIP gracefully instead of triggering the `@mysten/sui`
   * "MVR Api URL is not set" hard error. When a real `0x…` id is present the
   * executors behave exactly as before.
   */
  packageId?: string;
  /** Opaque Sui client (e.g. `SuiClient`); typed `unknown` to avoid coupling. */
  client: unknown;
  /** Build->sponsor->sign->execute a transaction. Returns at least a digest. */
  execute: (tx: unknown) => Promise<{ digest: string; objectChanges?: unknown }>;
  /**
   * Optional Memwal-style agent memory. `remember` persists a memory and
   * (synchronously) returns the Walrus blob it landed in; `recall` runs a
   * semantic search over a namespace. Injected by the host (null/absent when no
   * relayer is configured → the memory steps skip gracefully).
   */
  memory?: {
    remember: (ns: string, text: string) => Promise<unknown>;
    recall: (ns: string, query: string, limit?: number) => Promise<unknown>;
  };
  /** Optional manifest/blob uploader (defaults to a Walrus upload host-side). */
  uploadManifest?: (...a: unknown[]) => Promise<{ blobId: string }>;
  /**
   * Optional REAL Harbor uploader. When present, the `harbor` executor stores
   * the (Seal-encrypted) bytes in the user's Walrus Harbor account via the
   * Harbor API and reports the real Harbor fileId/blobId. Injected by the host
   * from HARBOR_API_KEY + HARBOR_SPACE_ID + HARBOR_BUCKET_ID (the SDK engine
   * stays signer/secret-agnostic — it never reads those env vars itself).
   *
   * Absent (no HARBOR_API_KEY) → the harbor executor still skips/falls back to a
   * plain blob upload, so a no-Harbor run never crashes.
   */
  harbor?: {
    /** Upload raw bytes; returns the Harbor fileId/blobId and an optional URL. */
    upload: (
      content: Uint8Array,
      filename: string,
      options?: { contentType?: string },
    ) => Promise<{ blobId: string; fileId?: string; url?: string }>;
    /** Active private bucket's Seal policy; supplies template/default policy. */
    sealPolicyId?: string;
  };
  /**
   * Optional server-side media downloader for Harbor image archives. The host
   * validates schemes, DNS/IP ranges, redirects, MIME, magic bytes and size;
   * the signer-agnostic engine receives only the verified original bytes.
   */
  media?: {
    fetchImage: (url: string) => Promise<{
      bytes: Uint8Array;
      filename: string;
      contentType: "image/jpeg" | "image/png";
    }>;
  };
  /**
   * Optional REAL Mysten Seal encryptor, injected by the host. Given the bytes
   * to encrypt and a Seal access-policy id, returns a genuine Seal
   * `EncryptedObject` payload (threshold-sealed to the on-chain `bucket_policy`
   * package) — or `null` when real Seal is unavailable (offline / no key
   * servers / no published package), in which case the harbor executor falls
   * back to the AES envelope (`sealEncrypt`).
   *
   * The engine stays signer/SDK-agnostic: this is a plain function type with no
   * `@mysten/seal` or `SuiClient` import here. The host builds it (from the
   * read-only SuiClient + the AgentOS package id + network) and injects it,
   * mirroring `ctx.harbor` / `ctx.uploadManifest`. Absent → the harbor executor
   * uses the AES envelope directly, so a no-Seal run never crashes.
   */
  seal?: (
    data: Uint8Array,
    sealPolicyId: string,
  ) => Promise<Uint8Array | null>;
  /** Read-only resolver bundle (chain-first, registry fallback). Required by the coordinate executors. */
  resolve?: RunResolveBundle;
  /** Unsigned-PTB builder bundle. Required by the coordinate executors. */
  build?: RunBuildBundle;
}
