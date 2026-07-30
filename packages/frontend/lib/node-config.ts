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
 * locally so the client never imports `@agentos-sui/sdk/node`.
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
      label: "Private upload",
      kind: "boolean",
      hint: "Keep ON to Seal-encrypt before uploading to Harbor.",
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
      placeholder: "module::function",
      hint: "The function to call, e.g. gm_overflow::gm::gm",
    },
    {
      key: "extraArgs",
      label: "Move-call arguments (one key=value per line, optional)",
      placeholder: "name=My NFT\ndescription=...",
      kind: "textarea",
      hint: "For NFT minting, enter name and description here. A public Harbor image upload fills image_url automatically.",
    },
  ],

  // Memory = save a note into the agent's Walrus-backed memory so a later run
  // can recall it.
  memory: [
    {
      key: "namespace",
      label: "Namespace",
      placeholder: "agent.sui (default)",
      kind: "namespace",
      hint: "Which memory bucket to write into. Defaults to this agent's .sui name.",
    },
    {
      key: "text",
      label: "Text to remember (optional)",
      placeholder: "defaults to a run digest",
      kind: "textarea",
      hint: "The note to save. Leave blank to store an auto digest of this run.",
    },
  ],

  // Memory Recall = search the agent's memory and return matching notes.
  "memory-recall": [
    {
      key: "namespace",
      label: "Namespace",
      placeholder: "agent.sui (default)",
      kind: "namespace",
      hint: "Which memory bucket to search. Defaults to this agent's .sui name.",
    },
    {
      key: "query",
      label: "Query",
      placeholder: "what did I store?",
      hint: "What to search for. Required — the node errors without a query.",
    },
    {
      key: "limit",
      label: "Limit (optional)",
      placeholder: "5",
      kind: "number",
      hint: "Max number of notes to return.",
      validate: validateNonNegInt,
    },
  ],

  // Import Agent = read another agent's published skill catalog (and verify it).
  "import-agent": [
    {
      key: "agent",
      label: "Target agent (.sui)",
      placeholder: "alice.sui",
      hint: "The agent whose skill catalog to read and hash-verify.",
      validate: validateSuiName,
    },
  ],

  // Delegate = grant a child agent a capability to act on this agent's behalf.
  delegate: [
    {
      key: "child",
      label: "Child agent (.sui / 0x…)",
      placeholder: "alice.sui",
      hint: "The agent receiving the grant. A .sui name is resolved to a 0x address first.",
      validate: validateNameOrAddress,
    },
    {
      key: "spendLimit",
      label: "Spend limit",
      placeholder: "0",
      kind: "number",
      hint: "Max the child may spend under this grant. 0 = no spending allowed.",
      validate: validateNonNegInt,
    },
    {
      key: "expiryMs",
      label: "Expiry (ms epoch, 0 = none)",
      placeholder: "0",
      kind: "number",
      hint: "When the grant expires (Unix ms). 0 = never expires.",
      validate: validateNonNegInt,
    },
  ],

  // Call Sub-Agent = run another agent's skill, optionally under a delegation.
  "call-sub-agent": [
    {
      key: "skill",
      label: "Skill (.sui)",
      placeholder: "alice.sui",
      hint: "The agent/skill to call.",
      validate: validateSuiName,
    },
    {
      key: "delegationCapId",
      label: "Delegation cap id (0x…, optional)",
      placeholder: "0x… (from Delegate output)",
      hint: "Paste the cap id from a Delegate node to call under that grant. Blank = direct call.",
      validate: validateHexId,
    },
    {
      key: "subjectPassportId",
      label: "Subject passport id (0x…, optional)",
      placeholder: "0x…",
      hint: "The passport the call acts for. Leave blank to use this agent's own.",
      validate: validateHexId,
    },
    {
      key: "cost",
      label: "Cost",
      placeholder: "0",
      kind: "number",
      hint: "Amount charged against the delegation's spend limit.",
      validate: validateNonNegInt,
    },
  ],

  // Attest = record an on-chain reputation note about another agent.
  attest: [
    {
      key: "subjectPassportId",
      label: "Subject passport id (0x…)",
      placeholder: "0x…",
      hint: "The passport this attestation is about. Blank = this agent attests itself.",
      validate: validateHexId,
    },
    {
      key: "kind",
      label: "Kind",
      placeholder: "review",
      kind: "select",
      hint: "What kind of attestation this is.",
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
      hint: "Rating from 0 to 100.",
      validate: validateScore,
    },
    {
      key: "uri",
      label: "URI (optional)",
      placeholder: "",
      hint: "Optional link to supporting evidence (e.g. a report or run).",
    },
  ],
};

/**
 * Optional one-line note shown at the TOP of a node's inline config form (under
 * the title), explaining what the whole node does — and, for Harbor, carrying
 * the honest caveat that the encryption is a demo AES stand-in, not real
 * threshold Seal yet. Keyed by node label (empty when a type has no note).
 */
export const NODE_FORM_NOTES: Partial<Record<string, string>> = {
  Harbor: "Choose a JPG/PNG from your computer and upload it to Harbor. Public uploads receive a preview URL automatically.",
};

/** Look up the form-level note for a canvas node label (undefined when none). */
export function formNoteForLabel(label: string): string | undefined {
  return NODE_FORM_NOTES[label];
}

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
