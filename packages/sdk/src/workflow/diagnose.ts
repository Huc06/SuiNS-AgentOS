/**
 * Workflow diagnostics: turn raw step errors into a structured, human-readable
 * cause + remediation, and predict (without executing) which nodes will run,
 * skip, or error given the presence of the env vars / package id / passport the
 * host knows about.
 *
 * This module is **pure** and signer-agnostic. It never reads secrets — callers
 * pass in PRESENCE BOOLEANS (e.g. `suiKey: true`), never values. The SDK side
 * stays free of any env/Enoki coupling, exactly like the executors.
 */

import type {
  StepResult,
  StepStatus,
  WorkflowGraph,
  WorkflowNode,
  WorkflowNodeType,
} from "./types.js";

/**
 * A coarse, stable classification of a failed (or skipped) step. The UI keys
 * remediation copy off this rather than fragile substring matching.
 */
export type StepErrorCode =
  | "ENV_MISSING"
  | "NO_PACKAGE_ID"
  | "PASSPORT_NOT_ONCHAIN"
  | "MEMWAL_UNSET"
  | "WALRUS_UPLOAD"
  | "MOVE_ABORT"
  | "SPONSOR_REJECTED"
  | "RESOLVE_FAILED"
  | "MANIFEST_INTEGRITY"
  | "MISSING_CAPABILITY"
  | "MISSING_CONFIG"
  | "HOST_MISCONFIG"
  | "PUBLIC_SKIP"
  | "MEMWAL_SKIP"
  | "NOTHING_TO_RUN"
  | "BLOCKED_UPSTREAM"
  | "UNKNOWN";

/** Severity buckets used by the UI to colour a step row / badge. */
export type DiagnosisSeverity = "error" | "skip" | "info" | "ok";

/** A structured diagnosis for a single settled step. */
export interface StepDiagnosis {
  code: StepErrorCode;
  /** One-line human explanation of WHY this happened. */
  cause: string;
  /** One-line, actionable next step. */
  remediation: string;
  severity: DiagnosisSeverity;
}

/** A classified error: a stable code + a short hint, derived from the raw message. */
export interface ClassifiedError {
  code: StepErrorCode;
  hint: string;
}

interface ErrorRule {
  code: StepErrorCode;
  test: RegExp;
  hint: string;
  cause: string;
  remediation: string;
}

/**
 * Ordered rule table — first match wins, so put the specific patterns before
 * the broad ones. Patterns are matched case-insensitively against the raw
 * `StepResult.error` string.
 */
const ERROR_RULES: ErrorRule[] = [
  {
    code: "ENV_MISSING",
    test: /SUI_PRIVATE_KEY is not set/i,
    hint: "Server signing key not loaded (SUI_PRIVATE_KEY).",
    cause:
      "The server route could not see SUI_PRIVATE_KEY, so it cannot sign the sponsored transaction.",
    remediation:
      "Add SUI_PRIVATE_KEY to the env the run route loads (repo-root .env reaching the route, or packages/frontend/.env.local).",
  },
  {
    code: "ENV_MISSING",
    test: /ENOKI_SECRET_KEY is not set/i,
    hint: "Enoki sponsor key not loaded (ENOKI_SECRET_KEY).",
    cause:
      "ENOKI_SECRET_KEY is missing, so Enoki gas sponsorship cannot be initialised.",
    remediation:
      "Add ENOKI_SECRET_KEY to the env the run route loads (repo-root .env or packages/frontend/.env.local).",
  },
  {
    code: "MANIFEST_INTEGRITY",
    test: /integrity check failed|manifest hash mismatch|expected .*, got/i,
    hint: "Manifest hash mismatch — stored hash ≠ recomputed.",
    cause:
      "The downloaded manifest blob does not hash to the value recorded on-chain (tampered/stale blob, or wrong hash).",
    remediation: "Re-publish the skill so the blob and the stored hash agree.",
  },
  {
    code: "MISSING_CAPABILITY",
    test: /missing required capability/i,
    hint: "Agent lacks a capability the skill requires.",
    cause:
      "The skill's manifest lists a `policyRequired` capability the (sub-)agent does not hold.",
    remediation:
      "Pass params.agentCapabilities including the required policy, or grant the capability to the agent.",
  },
  {
    code: "WALRUS_UPLOAD",
    test: /walrus upload failed|missing blobId/i,
    hint: "Walrus publisher rejected the upload.",
    cause:
      "The Walrus publisher returned a non-2xx (no public publisher on mainnet, outage, rate-limit, or oversized blob).",
    remediation:
      "Run on testnet for the public publisher, or configure an authenticated publisher / upload relay.",
  },
  {
    code: "MEMWAL_UNSET",
    test: /memwal .*failed/i,
    hint: "Memory relayer rejected the write.",
    cause:
      "The Memwal relayer returned a non-2xx (bad API key, relayer down, or namespace rejected).",
    remediation: "Verify MEMWAL_API_KEY / MEMWAL_RELAYER_URL and that the relayer is up.",
  },
  {
    code: "RESOLVE_FAILED",
    test: /agent not found|skill not found|is not active/i,
    hint: "Target agent/skill could not be resolved.",
    cause:
      "The .sui name did not resolve on-chain or in the local registry, or the resolved agent is not active.",
    remediation: "Use a registered, active .sui name (publish/register it first).",
  },
  {
    code: "PASSPORT_NOT_ONCHAIN",
    test: /no (parent )?passport id|object 0x.* does not exist/i,
    hint: "Agent has no on-chain passport object.",
    cause:
      "The passport id is missing or synthetic (registry-only, never minted), so the object does not exist on-chain.",
    remediation: "Use an agent whose passport was minted on-chain (set params.parentPassportId / mint the passport).",
  },
  {
    code: "MOVE_ABORT",
    test: /move abort|not found in module|function .* not found|cap expired|assert_valid|consume/i,
    hint: "On-chain Move call aborted.",
    cause:
      "A Move assertion failed or the target function is not deployed (undeployed package, expired/over-budget cap, missing object).",
    remediation:
      "Set AGENTOS_PACKAGE_ID to a published package with the needed modules; use a valid, unexpired cap and on-chain objects.",
  },
  {
    code: "SPONSOR_REJECTED",
    test: /sender address not allowed|not allowed|enoki|sponsor/i,
    hint: "Enoki rejected the sponsored transaction.",
    cause:
      "The runtime sender is not on the Enoki allowlist, or the network does not match the Enoki app config.",
    remediation:
      "Add the runtime address to the Enoki app's allowed senders and confirm NEXT_PUBLIC_SUI_NETWORK matches the Enoki network.",
  },
  {
    code: "MISSING_CONFIG",
    test: /requires a non-empty sealPolicyId|no sealPolicyId|marked private but no/i,
    hint: "Private skill missing a sealPolicyId.",
    cause: "The node is marked private but no sealPolicyId was provided to Seal-encrypt with.",
    remediation: "Add params.sealPolicyId (or set params.private to the policy id string).",
  },
  {
    code: "HOST_MISCONFIG",
    test: /bundle not injected by host/i,
    hint: "Host did not inject a required bundle (resolve/build).",
    cause:
      "The RunContext was built without the resolve/build bundle this executor needs.",
    remediation: "Inject the resolve/build bundle in the host (the run route already does).",
  },
  {
    code: "MISSING_CONFIG",
    test: /no target agent|no skill .*name|no child agent|no subjectPassportId|no executor for node type/i,
    hint: "A required field is missing on the node.",
    cause: "The node is missing a required parameter (target name / id).",
    remediation: "Fill in the node's required config field before running.",
  },
  {
    code: "MISSING_CONFIG",
    test: /score must be a number|requires either a .*recipient|subjectPassportId .* is required/i,
    hint: "A node parameter is invalid or incomplete.",
    cause: "A node parameter is out of range or a required disposition is missing.",
    remediation: "Correct the node's parameters (valid score 0–100, set recipient or share, etc.).",
  },
];

/**
 * Classify a raw error string into a stable code + short hint. Falls back to
 * `UNKNOWN` with the raw message as the hint.
 */
export function classifyError(raw: string | undefined): ClassifiedError {
  const message = (raw ?? "").trim();
  if (!message) return { code: "UNKNOWN", hint: "Unknown error." };
  for (const rule of ERROR_RULES) {
    if (rule.test.test(message)) return { code: rule.code, hint: rule.hint };
  }
  return { code: "UNKNOWN", hint: message.slice(0, 120) };
}

/**
 * Read a `{ note?: string }` out of a step's output (skipped steps carry a
 * human note there).
 */
function outputNote(output: unknown): string | undefined {
  if (output && typeof output === "object" && "note" in output) {
    const note = (output as { note?: unknown }).note;
    return typeof note === "string" ? note : undefined;
  }
  return undefined;
}

/**
 * Turn a settled {@link StepResult} into a structured diagnosis. Pure: no env,
 * no I/O. Returns a diagnosis for error / skipped / pending steps; for
 * `done`/`running`/other an `ok`/`info` diagnosis is returned so callers can
 * render uniformly.
 */
export function diagnoseStep(step: StepResult): StepDiagnosis {
  if (step.status === "error") {
    const { code } = classifyError(step.error);
    const rule = ERROR_RULES.find((r) => r.test.test(step.error ?? ""));
    if (rule) {
      return {
        code: rule.code,
        cause: rule.cause,
        remediation: rule.remediation,
        severity: "error",
      };
    }
    return {
      code,
      cause: step.error ?? "The step failed without a message.",
      remediation: "Inspect the raw error and the node configuration.",
      severity: "error",
    };
  }

  if (step.status === "skipped") {
    const note = outputNote(step.output) ?? "";
    if (/memwal not configured/i.test(note)) {
      return {
        code: "MEMWAL_SKIP",
        cause: "No memory relayer configured (MEMWAL_RELAYER_URL / MEMWAL_API_KEY unset).",
        remediation:
          "This is not a failure. Set MEMWAL_RELAYER_URL + MEMWAL_API_KEY to enable agent memory.",
        severity: "skip",
      };
    }
    if (/seal encryption skipped|public skill/i.test(note)) {
      return {
        code: "PUBLIC_SKIP",
        cause: "Public skill — there is nothing to Seal-encrypt.",
        remediation:
          "Intended for public skills. Set params.private=true + a sealPolicyId to exercise Seal.",
        severity: "skip",
      };
    }
    if (/nothing to execute on-chain|no passport id or move target/i.test(note)) {
      return {
        code: "NOTHING_TO_RUN",
        cause: "No passport id and no Move target — nothing to run on-chain.",
        remediation:
          "Give the agent an on-chain passport id, or set params.movePackage + params.entry on the node.",
        severity: "skip",
      };
    }
    if (/upstream skipped/i.test(note)) {
      return {
        code: "BLOCKED_UPSTREAM",
        cause: "An upstream node skipped, so this node had nothing to act on.",
        remediation:
          "Resolve the upstream skip (e.g. set the package id / wire the relayer) to enable this node.",
        severity: "skip",
      };
    }
    if (/no packageId|not a published 0x package/i.test(note)) {
      return {
        code: "NO_PACKAGE_ID",
        cause:
          "No published AgentOS package id is configured, so the on-chain module cannot be targeted.",
        remediation:
          "Set NEXT_PUBLIC_AGENTOS_PACKAGE_ID (or AGENTOS_PACKAGE_ID) to a published 0x package id.",
        severity: "skip",
      };
    }
    if (/not resolvable on-chain/i.test(note)) {
      return {
        code: "RESOLVE_FAILED",
        cause:
          "The target .sui name does not resolve to an on-chain address (no passport registered on this network).",
        remediation:
          "Register/mint the agent on-chain (so its .sui name resolves), or point the node at a 0x address.",
        severity: "skip",
      };
    }
    return {
      code: "MISSING_CONFIG",
      cause: note || "Step was skipped.",
      remediation: "No action needed unless this step was expected to run.",
      severity: "skip",
    };
  }

  if (step.status === "pending") {
    return {
      code: "BLOCKED_UPSTREAM",
      cause: "Blocked by an upstream failure — this node never ran.",
      remediation: "Fix the upstream error, then re-run the workflow.",
      severity: "info",
    };
  }

  return {
    code: "UNKNOWN",
    cause: step.status === "done" ? "Completed successfully." : `Status: ${step.status}.`,
    remediation: "",
    severity: step.status === "done" ? "ok" : "info",
  };
}

/**
 * PRESENCE flags the host passes to {@link preflight}. Every member is a boolean
 * (does the var/object EXIST) — never a secret value. The SDK never reads env.
 */
export interface PreflightEnv {
  /** SUI_PRIVATE_KEY present server-side (signs sponsored txs). */
  suiKey: boolean;
  /** ENOKI_SECRET_KEY present server-side (gas sponsorship). */
  enokiKey: boolean;
  /** MEMWAL relayer configured (MEMWAL_RELAYER_URL + MEMWAL_API_KEY). */
  memwal: boolean;
  /** A non-placeholder AGENTOS package id is configured. */
  packageId: boolean;
  /** The agent has a passport id known to exist on-chain. */
  passportOnChain: boolean;
  /** Sui network the run will target. */
  network?: "mainnet" | "testnet" | "devnet";
  /** True when a custom Walrus publisher URL is configured. */
  customWalrusPublisher?: boolean;
}

/** Predicted outcome for a single node, computed WITHOUT executing it. */
export type PreflightOutcome = "will-run" | "will-skip" | "will-error";

/** A per-node preflight prediction. */
export interface PreflightNode {
  nodeId: string;
  type: WorkflowNodeType;
  outcome: PreflightOutcome;
  /** Short human reason for the prediction. */
  reason: string;
  /** Stable code (shares the {@link StepErrorCode} space) for keyed UI copy. */
  code: StepErrorCode;
}

/** The full preflight report for a graph. */
export interface PreflightReport {
  nodes: PreflightNode[];
  /**
   * A hard blocker is present when a node WILL error purely because of missing
   * server env (SUI_PRIVATE_KEY / ENOKI_SECRET_KEY) — the run should be gated.
   */
  hasHardBlocker: boolean;
}

/** Node types that submit an on-chain tx and therefore need server signing env. */
const ONCHAIN_TYPES: ReadonlySet<WorkflowNodeType> = new Set([
  "sui",
  "delegate",
  "call-sub-agent",
  "attest",
]);

/** Read a node param as a non-empty string. */
function nodeStr(node: WorkflowNode, key: string): string | undefined {
  const v = node.params?.[key];
  return typeof v === "string" && v.trim().length > 0 ? v : undefined;
}

function isTruthyParam(node: WorkflowNode, key: string): boolean {
  const v = node.params?.[key];
  if (typeof v === "string") return v.trim().length > 0 && v !== "false";
  return Boolean(v);
}

/**
 * Predict, per node, whether it WILL run / skip / error — WITHOUT executing
 * anything. Uses only the static graph + the presence booleans. Mirrors the
 * executor guard logic so the canvas can warn BEFORE a run.
 */
export function preflight(
  graph: WorkflowGraph,
  env: PreflightEnv,
): PreflightReport {
  const needsServerEnv = (): { ok: boolean; reason: string; code: StepErrorCode } => {
    if (!env.suiKey) {
      return {
        ok: false,
        reason: "SUI_PRIVATE_KEY not set — server cannot sign the sponsored tx.",
        code: "ENV_MISSING",
      };
    }
    if (!env.enokiKey) {
      return {
        ok: false,
        reason: "ENOKI_SECRET_KEY not set — gas sponsorship unavailable.",
        code: "ENV_MISSING",
      };
    }
    return { ok: true, reason: "", code: "UNKNOWN" };
  };

  const nodes: PreflightNode[] = graph.nodes.map((node) => {
    const t = node.type;
    const mk = (
      outcome: PreflightOutcome,
      reason: string,
      code: StepErrorCode = "UNKNOWN",
    ): PreflightNode => ({ nodeId: node.id, type: t, outcome, reason, code });

    switch (t) {
      case "trigger":
        return mk("will-run", "Trigger always runs.");

      case "walrus": {
        if (
          env.network === "mainnet" &&
          !env.customWalrusPublisher
        ) {
          return mk(
            "will-error",
            "Mainnet has no public Walrus publisher — upload will fail.",
            "WALRUS_UPLOAD",
          );
        }
        return mk("will-run", "Walrus upload (public testnet publisher).");
      }

      case "harbor": {
        const isPrivate = isTruthyParam(node, "private");
        if (!isPrivate) {
          return mk("will-skip", "Public skill — Seal encryption skipped.", "PUBLIC_SKIP");
        }
        const sealPolicyId =
          nodeStr(node, "sealPolicyId") ??
          (node.params?.private && typeof node.params.private === "string"
            ? node.params.private
            : undefined);
        if (!sealPolicyId) {
          return mk(
            "will-error",
            "Marked private but no sealPolicyId provided.",
            "MISSING_CONFIG",
          );
        }
        return mk("will-run", "Private skill — Seal-encrypt then upload.");
      }

      case "memory": {
        if (!env.memwal) {
          return mk(
            "will-skip",
            "No memory relayer configured (skipped, not a failure).",
            "MEMWAL_SKIP",
          );
        }
        return mk("will-run", "Memory write to the relayer.");
      }

      case "memory-recall": {
        if (!env.memwal) {
          return mk(
            "will-skip",
            "No memory relayer configured (skipped, not a failure).",
            "MEMWAL_SKIP",
          );
        }
        if (!nodeStr(node, "query")) {
          return mk(
            "will-error",
            "No recall query provided (params.query).",
            "MISSING_CONFIG",
          );
        }
        return mk("will-run", "Semantic recall from the relayer.");
      }

      case "sui": {
        const hasMoveTarget = Boolean(nodeStr(node, "movePackage") && nodeStr(node, "entry"));
        const hasPassport = Boolean(nodeStr(node, "passportId")) || env.passportOnChain;
        if (!hasMoveTarget && !hasPassport) {
          return mk(
            "will-skip",
            "No passport id or Move target — nothing to execute on-chain.",
            "NOTHING_TO_RUN",
          );
        }
        const e = needsServerEnv();
        if (!e.ok) return mk("will-error", e.reason, e.code);
        if (!env.passportOnChain && !nodeStr(node, "passportId") && !hasMoveTarget) {
          return mk(
            "will-error",
            "Passport is not on-chain — record_execution will abort.",
            "PASSPORT_NOT_ONCHAIN",
          );
        }
        return mk("will-run", "Record execution / Move call on-chain.");
      }

      case "delegate": {
        const hasParent = Boolean(nodeStr(node, "parentPassportId")) || env.passportOnChain;
        if (!hasParent) {
          return mk(
            "will-error",
            "No parent passport id (agent never minted).",
            "PASSPORT_NOT_ONCHAIN",
          );
        }
        if (!nodeStr(node, "child") && !nodeStr(node, "childAgent")) {
          return mk("will-error", "No child agent provided.", "MISSING_CONFIG");
        }
        const e = needsServerEnv();
        if (!e.ok) return mk("will-error", e.reason, e.code);
        if (!env.packageId) {
          return mk(
            "will-error",
            "No AGENTOS package id — delegation module not deployed.",
            "NO_PACKAGE_ID",
          );
        }
        return mk("will-run", "Grant a DelegationCap on-chain.");
      }

      case "call-sub-agent": {
        if (!nodeStr(node, "skill") && !nodeStr(node, "suinsName")) {
          return mk("will-error", "No skill .sui name provided.", "MISSING_CONFIG");
        }
        if (nodeStr(node, "delegationCapId") && !nodeStr(node, "subjectPassportId") && !env.passportOnChain) {
          return mk(
            "will-error",
            "delegationCapId set without subjectPassportId.",
            "MISSING_CONFIG",
          );
        }
        const e = needsServerEnv();
        if (!e.ok) return mk("will-error", e.reason, e.code);
        return mk("will-run", "Delegated skill execution on-chain.");
      }

      case "attest": {
        if (!nodeStr(node, "subjectPassportId") && !nodeStr(node, "subject")) {
          return mk("will-error", "No subjectPassportId provided.", "MISSING_CONFIG");
        }
        if (!nodeStr(node, "recipient") && !isTruthyParam(node, "share")) {
          return mk(
            "will-error",
            "No disposition — set a recipient or share=true.",
            "MISSING_CONFIG",
          );
        }
        const e = needsServerEnv();
        if (!e.ok) return mk("will-error", e.reason, e.code);
        return mk("will-run", "Write a reputation attestation on-chain.");
      }

      case "import-agent": {
        if (!nodeStr(node, "agent") && !nodeStr(node, "name")) {
          return mk("will-error", "No target agent .sui name provided.", "MISSING_CONFIG");
        }
        return mk("will-run", "Read-only: resolve + verify the skill catalog.");
      }

      default:
        return mk("will-error", `No executor for node type: ${t}`, "MISSING_CONFIG");
    }
  });

  const hasHardBlocker = nodes.some(
    (n) =>
      n.outcome === "will-error" &&
      n.code === "ENV_MISSING" &&
      ONCHAIN_TYPES.has(n.type),
  );

  return { nodes, hasHardBlocker };
}

// Re-export for callers that want the on-chain type set (e.g. gating Run).
export { ONCHAIN_TYPES as ONCHAIN_NODE_TYPES };

/** A status string the UI can use, derived from a step + its diagnosis. */
export type StepStatusForUi = StepStatus;
