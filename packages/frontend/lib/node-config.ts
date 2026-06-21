/**
 * Per-node-type editable-param schema for the workflow canvas.
 *
 * The canvas renders a small inline config form when a node's Edit (pencil)
 * button is clicked. This module owns WHICH params each node type exposes, how
 * to render each field, and a light, inline validation hint per field. The
 * field `key`s map 1:1 to the param keys the SDK workflow executors read
 * (see `packages/sdk/src/workflow/executors.ts`) so an edited value flows
 * straight through `buildRunnableGraph` into the run POST body.
 *
 * Browser-safe: no Node-only imports. Validation mirrors the SDK's own checks
 * (`isValidSuiNSName`, the `0x…` address regex, the attest 0..=100 score range)
 * locally so the client never imports `@agentos/sdk/node`.
 */

export type WfType =
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

/** How a field renders in the inline config form. */
export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "boolean"
  | "select"
  | "namespace";

/** A single editable param for a node type. */
export interface NodeParamField {
  /** Param key — must match the key the executor reads. */
  key: string;
  /** Human label shown above the input. */
  label: string;
  /** Placeholder / hint shown in the empty input. */
  placeholder?: string;
  /** Render mode (default "text"). */
  kind?: FieldKind;
  /** Options for a `select` field. */
  options?: { value: string; label: string }[];
  /** Short helper line under the field (e.g. what the param does). */
  hint?: string;
  /**
   * Validate the raw string value. Return an error message (truthy) to mark the
   * field invalid, or `undefined`/empty when it is acceptable. Empty input is
   * always treated as "use the default" and never flagged (the executors all
   * fall back sensibly), so validators should early-return on a blank value.
   */
  validate?: (value: string) => string | undefined;
}

// ===== shared validators (mirror the SDK) =====

/** A Sui object/address id: `0x` followed by 1..=64 hex chars. */
const HEX_ADDRESS = /^0x[0-9a-fA-F]{1,64}$/;

/** True when `value` is a concrete on-chain Sui address (`0x…hex`). */
export function isHexAddress(value: string): boolean {
  return HEX_ADDRESS.test(value.trim());
}

/**
 * Validate a SuiNS name input (mirrors the SDK `isValidSuiNSName`). Must end
 * with `.sui` and carry at least one non-empty label before the TLD.
 */
export function isSuiNSName(name: string): boolean {
  const normalized = name.replace(/^@/, "").trim();
  if (!normalized) return false;
  if (!normalized.endsWith(".sui")) return false;
  const withoutTld = normalized.slice(0, -4);
  if (!withoutTld || withoutTld.startsWith(".") || withoutTld.endsWith("."))
    return false;
  return true;
}

/** Field validator: blank is OK; otherwise must be a `.sui` name. */
function validateSuiName(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  return isSuiNSName(v) ? undefined : "must be a .sui name (e.g. alice.sui)";
}

/** Field validator: blank is OK; otherwise must be a `.sui` name OR `0x…`. */
function validateNameOrAddress(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  return isSuiNSName(v) || isHexAddress(v)
    ? undefined
    : "must be a .sui name or a 0x address";
}

/** Field validator: blank is OK; otherwise must be a `0x…` Sui object id. */
function validateHexId(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  return isHexAddress(v) ? undefined : "must be a 0x object id";
}

/** Field validator: blank is OK; otherwise a non-negative integer. */
function validateNonNegInt(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (!/^\d+$/.test(v)) return "must be a whole number ≥ 0";
  return undefined;
}

/** Field validator: blank is OK; otherwise an integer in 0..=100. */
function validateScore(value: string): string | undefined {
  const v = value.trim();
  if (!v) return undefined;
  if (!/^\d+$/.test(v)) return "must be a whole number";
  const n = Number(v);
  return n >= 0 && n <= 100 ? undefined : "must be 0..=100";
}

// ===== per-type field schema =====
//
// Every key here maps to a param key an executor reads. Fields are ordered most-
// to least important so the inline form reads top-down. `trigger` exposes its
// human label (which lives on `node.data.label`/`subtitle`, handled by the
// caller) — see TRIGGER_FIELDS below, surfaced via the editor's label control.

export const NODE_PARAM_FIELDS: Record<WfType, NodeParamField[]> = {
  trigger: [
    {
      key: "label",
      label: "Caption",
      placeholder: "Manual start",
      hint: "Display caption for this start node.",
    },
  ],

  walrus: [
    {
      key: "manifest",
      label: "Manifest / text to store",
      placeholder: '{"name":"my skill","version":"0.1.0"}',
      kind: "textarea",
      hint: "Stored verbatim as a Walrus blob. JSON or plain text.",
    },
  ],

  harbor: [
    {
      key: "private",
      label: "Private (Seal-encrypt)",
      kind: "boolean",
      hint: "When off, encryption is skipped (public skill).",
    },
    {
      key: "sealPolicyId",
      label: "Seal policy id",
      placeholder: "demo-policy",
      hint: "Required when Private is on.",
    },
    {
      key: "manifest",
      label: "Manifest / text to encrypt",
      placeholder: '{"name":"my skill"}',
      kind: "textarea",
    },
  ],

  sui: [
    {
      key: "movePackage",
      label: "Move package (0x…)",
      placeholder: "0x… (published package)",
      hint: "For a custom move-call. Leave blank to record_execution.",
      validate: validateHexId,
    },
    {
      key: "entry",
      label: "Entry (module::function)",
      placeholder: "skill::run",
      hint: "Paired with Move package for a generic call.",
    },
    {
      key: "passportId",
      label: "Passport id (0x…, optional)",
      placeholder: "0x… (defaults to the agent's passport)",
      validate: validateHexId,
    },
    {
      key: "packageId",
      label: "AgentOS package id (0x…, optional)",
      placeholder: "0x… (overrides NEXT_PUBLIC_AGENTOS_PACKAGE_ID)",
      validate: validateHexId,
    },
  ],

  memory: [
    {
      key: "namespace",
      label: "Namespace",
      placeholder: "agent.sui (default)",
      kind: "namespace",
    },
    {
      key: "text",
      label: "Text to remember (optional)",
      placeholder: "defaults to a run digest",
      kind: "textarea",
    },
  ],

  "memory-recall": [
    {
      key: "namespace",
      label: "Namespace",
      placeholder: "agent.sui (default)",
      kind: "namespace",
    },
    { key: "query", label: "Query", placeholder: "what did I store?" },
    {
      key: "limit",
      label: "Limit (optional)",
      placeholder: "5",
      kind: "number",
      validate: validateNonNegInt,
    },
  ],

  "import-agent": [
    {
      key: "agent",
      label: "Target agent (.sui)",
      placeholder: "alice.sui",
      validate: validateSuiName,
    },
  ],

  delegate: [
    {
      key: "child",
      label: "Child agent (.sui / 0x…)",
      placeholder: "alice.sui",
      hint: "A .sui name is resolved to a 0x address before the grant.",
      validate: validateNameOrAddress,
    },
    {
      key: "spendLimit",
      label: "Spend limit",
      placeholder: "0",
      kind: "number",
      validate: validateNonNegInt,
    },
    {
      key: "expiryMs",
      label: "Expiry (ms epoch, 0 = none)",
      placeholder: "0",
      kind: "number",
      validate: validateNonNegInt,
    },
  ],

  "call-sub-agent": [
    {
      key: "skill",
      label: "Skill (.sui)",
      placeholder: "alice.sui",
      validate: validateSuiName,
    },
    {
      key: "delegationCapId",
      label: "Delegation cap id (0x…, optional)",
      placeholder: "0x… (from Delegate output)",
      validate: validateHexId,
    },
    {
      key: "subjectPassportId",
      label: "Subject passport id (0x…, optional)",
      placeholder: "0x…",
      validate: validateHexId,
    },
    {
      key: "cost",
      label: "Cost",
      placeholder: "0",
      kind: "number",
      validate: validateNonNegInt,
    },
  ],

  attest: [
    {
      key: "subjectPassportId",
      label: "Subject passport id (0x…)",
      placeholder: "0x…",
      validate: validateHexId,
    },
    {
      key: "kind",
      label: "Kind",
      placeholder: "review",
      kind: "select",
      options: [
        { value: "review", label: "review" },
        { value: "endorsement", label: "endorsement" },
        { value: "completion", label: "completion" },
      ],
    },
    {
      key: "score",
      label: "Score (0-100)",
      placeholder: "100",
      kind: "number",
      validate: validateScore,
    },
    { key: "uri", label: "URI (optional)", placeholder: "" },
  ],
};

/**
 * Fields whose `key` is `"label"` write to the node's display caption
 * (`data.subtitle`) rather than to `params` — the trigger has no runtime params,
 * and we never touch `data.label` (it drives the node-type mapping). The editor
 * maps this one specially.
 */
export const LABEL_FIELD_KEY = "label";

/** Map a canvas node label to its workflow type (mirror of the editor map). */
export const LABEL_TO_WF_TYPE: Record<string, WfType> = {
  Trigger: "trigger",
  Walrus: "walrus",
  Memory: "memory",
  "Memory Recall": "memory-recall",
  Harbor: "harbor",
  Sui: "sui",
  "Import Agent": "import-agent",
  Delegate: "delegate",
  "Call Sub-Agent": "call-sub-agent",
  Attest: "attest",
};

/** Look up the editable fields for a canvas node label (empty when unknown). */
export function fieldsForLabel(label: string): NodeParamField[] {
  const t = LABEL_TO_WF_TYPE[label];
  return t ? NODE_PARAM_FIELDS[t] : [];
}

/**
 * Validate a node's current param values against its schema. Returns a map of
 * `{ fieldKey: errorMessage }` for every invalid field (empty when all clean).
 */
export function validateNodeParams(
  label: string,
  params: Record<string, string> | undefined,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of fieldsForLabel(label)) {
    if (!f.validate) continue;
    const msg = f.validate(params?.[f.key] ?? "");
    if (msg) errors[f.key] = msg;
  }
  return errors;
}
