"use client";

import {
  ReactFlow,
  Background,
  Controls,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  type ReactFlowInstance,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  nodeOutputSummary,
  nodeOutputDetail,
  suiscanObjectLink,
  type DetailField,
} from "../../../lib/node-output";
import {
  fieldsForLabel,
  validateNodeParams,
  formNoteForLabel,
  LABEL_FIELD_KEY,
  type NodeParamField,
} from "../../../lib/node-config";
import { TEMPLATES, templatesByCategory } from "../../../lib/workflow-templates";
import { defaultGraphForSlug } from "../../../lib/agent-workflows";

// ===== Run / status types (mirror @agentos/sdk workflow types, kept local so
// this client component never imports the Node-only SDK entry) =====

type NodeStatus =
  | "idle"
  | "pending"
  | "running"
  | "done"
  | "error"
  | "skipped";

type WfType =
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

interface SkillNodeData {
  label: string;
  subtitle?: string;
  status?: NodeStatus;
  txDigest?: string;
  blobId?: string;
  // Structured diagnosis carried from the run result (see @agentos/sdk diagnose).
  error?: string;
  errorCode?: string;
  cause?: string;
  remediation?: string;
  output?: unknown;
  // Per-node preflight prediction (fetched before a run).
  preflight?: PreflightNodeView;
  // Per-node params edited inline; flow into the run POST body.
  params?: Record<string, string>;
  // React Flow node data is an open record; keep this assignable to it.
  [key: string]: unknown;
}

interface StepResult {
  nodeId: string;
  type: WfType;
  status: NodeStatus;
  txDigest?: string;
  blobId?: string;
  output?: unknown;
  error?: string;
  errorCode?: string;
  errorHint?: string;
  cause?: string;
  remediation?: string;
}

// ===== Preflight (predicted before a run) =====

type PreflightOutcome = "will-run" | "will-skip" | "will-error";

interface PreflightNodeView {
  nodeId: string;
  type: WfType;
  outcome: PreflightOutcome;
  reason: string;
  code: string;
}

interface PreflightEnvSummary {
  suiKey: boolean;
  enokiKey: boolean;
  memwal: boolean;
  packageId: boolean;
  passportOnChain: boolean;
  network: "mainnet" | "testnet" | "devnet";
  customWalrusPublisher: boolean;
}

interface PreflightPayload {
  env: PreflightEnvSummary;
  report: { nodes: PreflightNodeView[]; hasHardBlocker: boolean };
}

interface RunRecord {
  runId: string;
  agentSlug?: string;
  status: "done" | "error";
  steps: StepResult[];
  createdAt: string;
}

// ===== Explorer URLs (testnet/mainnet, mirrors lib/explorer-links.ts) =====

const NETWORK: "mainnet" | "testnet" =
  process.env.NEXT_PUBLIC_SUI_NETWORK === "mainnet" ? "mainnet" : "testnet";

function suiscanTxUrl(digest: string): string {
  return `https://suiscan.xyz/${NETWORK}/tx/${digest}`;
}

function walruscanBlobUrl(blobId: string): string {
  return `https://walruscan.com/${NETWORK}/blob/${blobId}`;
}

// Map the canvas node label -> the workflow engine node type.
const LABEL_TO_TYPE: Record<string, WfType> = {
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

const TYPE_LABEL: Record<WfType, string> = {
  trigger: "Trigger",
  walrus: "Store",
  harbor: "Seal",
  sui: "Exec",
  memory: "Memory",
  "memory-recall": "Recall",
  "import-agent": "Import",
  delegate: "Delegate",
  "call-sub-agent": "Sub-Call",
  attest: "Attest",
};

// Per-node editable-param schema + validation now lives in lib/node-config.ts
// (shared, browser-safe). The inline config form below renders those fields.

// Known Walrus-memory namespaces for this agent, derived client-side from the
// registry (/api/namespaces). The memory nodes' namespace picker consumes this;
// the default (the agent's `.sui` name) is always element 0. Empty until the
// fetch lands. Memwal has NO list-namespaces endpoint, so this is registry-only.
const NamespacesContext = createContext<string[]>([]);

// Tools-panel + coordinate node visual descriptor, keyed by label.
const COORDINATE_TOOLS: { label: string; subtitle: string }[] = [
  { label: "Import Agent", subtitle: "Read skill catalog" },
  { label: "Delegate", subtitle: "Grant cap" },
  { label: "Call Sub-Agent", subtitle: "Delegated exec" },
  { label: "Attest", subtitle: "Reputation" },
];

function statusColor(status?: NodeStatus): string {
  switch (status) {
    case "done":
      return "text-green-700";
    case "error":
      return "text-red-600";
    case "running":
      return "text-amber-600";
    case "skipped":
    case "pending":
      return "text-black/40";
    default:
      return "text-black/60";
  }
}

function statusRing(status?: NodeStatus): string {
  switch (status) {
    case "running":
      return "border-amber-500 shadow-[0_0_0_4px_rgba(245,158,11,0.25)] animate-pulse";
    case "done":
      return "border-green-500 shadow-[0_0_0_4px_rgba(34,197,94,0.25)]";
    case "error":
      return "border-red-500 shadow-[0_0_0_4px_rgba(239,68,68,0.30)]";
    case "skipped":
      return "border-dashed border-pure-black/30 opacity-60";
    case "pending":
      return "border-pure-black/20 opacity-50";
    default:
      return "border-pure-black/30";
  }
}

function statusBadge(status?: NodeStatus): string | null {
  switch (status) {
    case "running":
      return "bg-amber-500";
    case "done":
      return "bg-green-500";
    case "error":
      return "bg-red-500";
    case "skipped":
      return "bg-black/30";
    case "pending":
      return "bg-black/20";
    default:
      return null;
  }
}

// Client-side fallback diagnosis for runs persisted before the engine attached
// a structured `cause` (back-compat). The engine now sets cause/remediation, so
// this only fires for older runs. Mirrors the SDK rule table at a high level.
function diagnoseFromError(error?: string): string | undefined {
  if (!error) return undefined;
  if (/SUI_PRIVATE_KEY is not set/i.test(error))
    return "Server key not loaded — add SUI_PRIVATE_KEY (root .env must reach the route).";
  if (/ENOKI_SECRET_KEY/i.test(error)) return "Enoki sponsor key missing (ENOKI_SECRET_KEY).";
  if (/memwal not configured/i.test(error))
    return "Memory API key not set (MEMWAL_API_KEY) — skipped, not a failure.";
  if (/Missing required capability/i.test(error))
    return "Agent lacks a capability the skill requires.";
  if (/integrity check failed/i.test(error)) return "Manifest hash mismatch — re-publish.";
  if (/no (parent )?passport id/i.test(error)) return "Agent has no on-chain passport.";
  if (/Walrus upload failed/i.test(error)) return "Walrus publisher rejected the upload.";
  return undefined;
}

// Short human cause for a step row: prefer the engine's `cause`, then the
// skipped note, then a client fallback from the raw error.
function shortCause(s: StepResult): string | undefined {
  if (s.cause) return s.cause;
  if (s.status === "skipped") {
    const note =
      s.output && typeof s.output === "object" && "note" in s.output
        ? String((s.output as { note?: unknown }).note ?? "")
        : "";
    if (note) return note;
  }
  return diagnoseFromError(s.error);
}

// Distinct colour for pending (blocked-by-upstream) vs skipped (intended).
function statusLabelColor(status?: NodeStatus): string {
  if (status === "pending") return "text-black/40 italic";
  if (status === "skipped") return "text-blue-700/70";
  return statusColor(status);
}

function preflightColor(outcome?: PreflightOutcome): string {
  switch (outcome) {
    case "will-run":
      return "border-green-600 bg-green-50 text-green-700";
    case "will-skip":
      return "border-blue-500 bg-blue-50 text-blue-700";
    case "will-error":
      return "border-red-600 bg-red-50 text-red-700";
    default:
      return "border-pure-black/20 bg-white text-black/50";
  }
}

function preflightGlyph(outcome?: PreflightOutcome): string {
  switch (outcome) {
    case "will-run":
      return "✓";
    case "will-skip":
      return "↩";
    case "will-error":
      return "!";
    default:
      return "·";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Resolve a DetailField link to a concrete explorer URL (network from module
// NETWORK). Returns undefined when the field is not a link.
function detailFieldHref(field: DetailField): string | undefined {
  if (!field.link) return undefined;
  switch (field.link.kind) {
    case "tx":
      return suiscanTxUrl(field.link.ref);
    case "blob":
      return walruscanBlobUrl(field.link.ref);
    case "object":
      return suiscanObjectLink(field.link.ref, NETWORK);
  }
}

// ===== Per-node output detail popover =====
// Renders the structured decode from nodeOutputDetail(): labelled fields (with
// explorer links), an import-agent catalog table, sui objectChanges, a memory
// recall list when present, plus the Raw JSON with a copy button.
function NodeOutputDetailPopover({
  label,
  detail,
  rawOutput,
  onClose,
}: {
  label: string;
  detail: ReturnType<typeof nodeOutputDetail>;
  rawOutput: unknown;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const raw = (() => {
    try {
      return JSON.stringify(rawOutput ?? {}, null, 2);
    } catch {
      return String(rawOutput);
    }
  })();

  const copyRaw = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(raw);
        setCopied(true);
        setTimeout(() => setCopied(false), 1200);
      }
    } catch {
      /* clipboard unavailable — no-op */
    }
  };

  return (
    <div
      className="nodrag nowheel absolute left-1/2 top-[110%] z-40 w-72 -translate-x-1/2 space-y-2 border-2 border-pure-black bg-white p-3 text-left shadow-[3px_3px_0_0_#000]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <p className="font-mono text-[10px] font-bold uppercase text-black/50">
          {label} output
        </p>
        <button
          type="button"
          onClick={onClose}
          className="font-mono text-xs font-bold text-black/40 hover:text-black"
          title="Close"
        >
          &times;
        </button>
      </div>

      {/* Labelled fields */}
      {detail.fields.length > 0 && (
        <div className="space-y-1">
          {detail.fields.map((f) => {
            const href = detailFieldHref(f);
            return (
              <div
                key={`${f.label}:${f.value}`}
                className="flex items-start justify-between gap-2"
              >
                <span className="font-mono text-[9px] uppercase text-black/40">
                  {f.label}
                </span>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="max-w-[170px] truncate font-mono text-[9px] font-bold text-electric-purple underline"
                    title={f.value}
                  >
                    {f.value}
                  </a>
                ) : (
                  <span
                    className={`max-w-[170px] truncate text-right text-[9px] text-black ${
                      f.mono ? "font-mono" : ""
                    }`}
                    title={f.value}
                  >
                    {f.value}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* import-agent: skill catalog table */}
      {detail.catalog && detail.catalog.length > 0 && (
        <div className="border-t border-pure-black/10 pt-1.5">
          <p className="mb-1 font-mono text-[9px] uppercase text-black/40">
            catalog
          </p>
          <div className="max-h-32 space-y-1 overflow-auto">
            {detail.catalog.map((c, i) => (
              <div
                key={`${c.name}:${i}`}
                className="flex items-center justify-between gap-2 font-mono text-[9px]"
              >
                <span className="flex-1 truncate text-black" title={c.name}>
                  {c.name}
                  {c.version ? (
                    <span className="text-black/40"> v{c.version}</span>
                  ) : null}
                </span>
                <span
                  className={`font-bold ${c.verified ? "text-green-700" : "text-red-600"}`}
                  title={c.error ?? (c.verified ? "hash verified" : "unverified")}
                >
                  {c.verified ? "✓ verified" : "✗ unverified"}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* sui: objectChanges summary */}
      {detail.objectChanges && (
        <div className="border-t border-pure-black/10 pt-1.5 font-mono text-[9px] text-black/60">
          objectChanges:{" "}
          <span className="font-bold text-black">
            {detail.objectChanges.created} created
          </span>{" "}
          / {detail.objectChanges.total} total
        </div>
      )}

      {/* memory: recall list (when present) */}
      {detail.recall && detail.recall.length > 0 && (
        <div className="border-t border-pure-black/10 pt-1.5">
          <p className="mb-1 font-mono text-[9px] uppercase text-black/40">
            recall
          </p>
          <div className="max-h-32 space-y-1 overflow-auto">
            {detail.recall.map((r, i) => (
              <div
                key={i}
                className="flex items-start justify-between gap-2 font-mono text-[9px]"
              >
                <span className="flex-1 truncate text-black" title={r.text}>
                  {r.text}
                </span>
                {r.score !== undefined && (
                  <span className="text-black/40">{r.score.toFixed(2)}</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Raw JSON + copy */}
      <div className="border-t border-pure-black/10 pt-1.5">
        <div className="mb-1 flex items-center justify-between">
          <p className="font-mono text-[9px] uppercase text-black/40">
            raw json
          </p>
          <button
            type="button"
            onClick={copyRaw}
            className="border border-pure-black/30 px-1.5 py-0.5 font-mono text-[9px] font-bold text-black hover:border-electric-purple"
          >
            {copied ? "copied" : "copy"}
          </button>
        </div>
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-all bg-surface-container px-2 py-1 font-mono text-[9px] text-black/70">
          {raw}
        </pre>
      </div>
    </div>
  );
}

// ===== Inline per-node config field =====
// Renders one editable field per its `kind` (text / textarea / number / boolean
// / select / namespace), with the schema's hint and an inline validation error.
// `boolean` stores "true"/"" (the executors read a truthy string). Edits flow
// up via onChange → the node's params (or, for the label field, its caption).
function NodeConfigField({
  field,
  nodeId,
  value,
  error,
  knownNamespaces,
  onChange,
}: {
  field: NodeParamField;
  nodeId: string;
  value: string;
  error?: string;
  knownNamespaces: string[];
  onChange: (value: string) => void;
}) {
  const baseInput =
    "mt-0.5 w-full border-2 bg-white px-2 py-1 font-mono text-[10px] text-black outline-none placeholder:text-black/30 focus:border-electric-purple";
  const borderClass = error ? "border-red-500" : "border-pure-black/30";

  if (field.kind === "boolean") {
    const on = value === "true";
    return (
      <label className="flex cursor-pointer items-center gap-2">
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => onChange(e.target.checked ? "true" : "")}
          className="h-3.5 w-3.5 accent-electric-purple"
        />
        <span className="font-mono text-[9px] text-black/60">{field.label}</span>
        {field.hint && (
          <span className="font-mono text-[8px] text-black/35">
            {field.hint}
          </span>
        )}
      </label>
    );
  }

  if (field.kind === "select") {
    return (
      <label className="block">
        <span className="font-mono text-[9px] text-black/60">{field.label}</span>
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${borderClass}`}
        >
          {(field.options ?? []).map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {field.hint && (
          <span className="mt-0.5 block font-mono text-[8px] text-black/40">
            {field.hint}
          </span>
        )}
      </label>
    );
  }

  if (field.kind === "textarea") {
    return (
      <label className="block">
        <span className="font-mono text-[9px] text-black/60">{field.label}</span>
        <textarea
          value={value}
          placeholder={field.placeholder}
          rows={3}
          onChange={(e) => onChange(e.target.value)}
          className={`${baseInput} ${borderClass} resize-y`}
        />
        {error ? (
          <span className="mt-0.5 block font-mono text-[8px] text-red-600">
            {error}
          </span>
        ) : (
          field.hint && (
            <span className="mt-0.5 block font-mono text-[8px] text-black/40">
              {field.hint}
            </span>
          )
        )}
      </label>
    );
  }

  const isNamespace = field.kind === "namespace";
  const listId = isNamespace ? `ns-${nodeId}-${field.key}` : undefined;
  return (
    <label className="block">
      <span className="font-mono text-[9px] text-black/60">{field.label}</span>
      <input
        type="text"
        inputMode={field.kind === "number" ? "numeric" : undefined}
        value={value}
        placeholder={field.placeholder}
        list={listId}
        onChange={(e) => onChange(e.target.value)}
        className={`${baseInput} ${borderClass}`}
      />
      {isNamespace && knownNamespaces.length > 0 && (
        <datalist id={listId}>
          {knownNamespaces.map((ns) => (
            <option key={ns} value={ns} />
          ))}
        </datalist>
      )}
      {error ? (
        <span className="mt-0.5 block font-mono text-[8px] text-red-600">
          {error}
        </span>
      ) : isNamespace && knownNamespaces.length > 0 ? (
        <span className="mt-0.5 block font-mono text-[8px] text-black/40">
          default {knownNamespaces[0]} · {knownNamespaces.length} known
        </span>
      ) : (
        field.hint && (
          <span className="mt-0.5 block font-mono text-[8px] text-black/40">
            {field.hint}
          </span>
        )
      )}
    </label>
  );
}

// ===== Custom Skill Node =====

function SkillNode({
  id,
  data,
}: {
  id: string;
  data: SkillNodeData;
}) {
  const { setNodes, setEdges } = useReactFlow();
  const [editing, setEditing] = useState(false);
  // Expandable per-node output detail popover (toggled from the hover toolbar).
  const [showDetail, setShowDetail] = useState(false);
  // Known memory namespaces (registry-derived) for the namespace picker.
  const knownNamespaces = useContext(NamespacesContext);

  const wfType = LABEL_TO_TYPE[data.label];
  // Editable fields for this node type (shared schema). A field whose key is
  // LABEL_FIELD_KEY ("label") writes to the node's display label, not params.
  const paramFields = fieldsForLabel(data.label);
  // Optional one-line "what this node does" note shown at the top of the config
  // form (carries the honest DEMO-encryption caveat for Harbor).
  const formNote = formNoteForLabel(data.label);
  // Per-field validation errors for the current values (inline hints below).
  const fieldErrors = validateNodeParams(data.label, data.params);

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) =>
      eds.filter((edge) => edge.source !== id && edge.target !== id),
    );
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing((p) => !p);
  };

  // Persist an edited param value back onto this node's data so it flows into
  // the run POST body (buildRunnableGraph copies node.data.params).
  const setParam = (key: string, value: string) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== id) return n;
        const prev = (n.data as SkillNodeData).params ?? {};
        return {
          ...n,
          data: { ...(n.data as SkillNodeData), params: { ...prev, [key]: value } },
        };
      }),
    );
  };

  // The "label" pseudo-field edits the node's display CAPTION (data.subtitle).
  // We never rewrite data.label — it drives LABEL_TO_TYPE — so the trigger stays
  // a valid, runnable node after editing.
  const setCaption = (value: string) => {
    setNodes((nds) =>
      nds.map((n) =>
        n.id === id
          ? { ...n, data: { ...(n.data as SkillNodeData), subtitle: value } }
          : n,
      ),
    );
  };

  const isCoordinate =
    wfType === "import-agent" ||
    wfType === "delegate" ||
    wfType === "call-sub-agent" ||
    wfType === "attest";

  const nodeColor = isCoordinate
    ? "group-hover:border-pink-500 group-hover:shadow-[0_0_12px_rgba(236,72,153,0.3)]"
    : data.label === "Walrus" ||
        data.label === "Memory" ||
        data.label === "Memory Recall"
      ? "group-hover:border-purple-500 group-hover:shadow-[0_0_12px_rgba(168,85,247,0.3)]"
      : data.label === "Harbor"
        ? "group-hover:border-blue-500 group-hover:shadow-[0_0_12px_rgba(96,165,250,0.3)]"
        : data.label === "Sui"
          ? "group-hover:border-cyan-500 group-hover:shadow-[0_0_12px_rgba(34,211,238,0.3)]"
          : "group-hover:border-orange-500 group-hover:shadow-[0_0_12px_rgba(249,115,22,0.3)]";

  const hasStatus = !!data.status && data.status !== "idle";
  const badge = statusBadge(data.status);

  // Human chip + structured detail for a settled DONE node (data already
  // carries step.output). Skipped/error stay on their dedicated captions below.
  const isDone = data.status === "done";
  const outputSummary =
    isDone && wfType ? nodeOutputSummary(wfType, data.output) : undefined;
  const outputDetail =
    isDone && wfType && showDetail
      ? nodeOutputDetail(wfType, data.output)
      : undefined;
  const boxClass = hasStatus
    ? `relative flex h-20 w-20 items-center justify-center rounded-2xl border-2 bg-white text-black transition-all ${statusRing(data.status)}`
    : `relative flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-pure-black/30 bg-white text-black transition-all ${nodeColor}`;

  return (
    <div className="group relative flex flex-col items-center">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-electric-purple !bg-white"
      />

      {/* Hover toolbar — Edit + Delete only */}
      <div className="absolute -top-10 left-1/2 flex -translate-x-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={handleEdit}
          className="flex h-7 w-7 items-center justify-center border-2 border-pure-black bg-white text-xs text-black hover:bg-surface-container"
          title="Edit"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M11 4H4v16h16v-7" />
            <path d="M18.5 2.5a2.12 2.12 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        {isDone && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowDetail((p) => !p);
            }}
            className={`flex h-7 w-7 items-center justify-center border-2 border-pure-black text-xs ${
              showDetail
                ? "bg-electric-purple text-white"
                : "bg-white text-black hover:bg-surface-container"
            }`}
            title="View output"
          >
            <svg
              width="12"
              height="12"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
          </button>
        )}
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-7 w-7 items-center justify-center border-2 border-pure-black bg-white text-xs text-red-600 hover:bg-red-50"
          title="Delete"
        >
          &times;
        </button>
      </div>

      {/* Node box */}
      <div className={boxClass}>
        {badge && (
          <span
            className={`absolute -right-1.5 -top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white ${badge}`}
            title={data.status}
          />
        )}
        {data.label === "Walrus" ? (
          // Walrus = blob/object store identity (the Walrus brand wordmark).
          <img
            src="/images/logos/walrus-memory.svg"
            alt="Walrus blob store"
            className="h-7 w-auto object-contain"
          />
        ) : data.label === "Memory" ? (
          // Memory = AGENT memory (remember/recall) — a brain glyph, NOT the
          // Walrus mark, so the two are instantly distinguishable.
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-label="Agent memory"
          >
            <path d="M9.5 3a3 3 0 0 0-3 3 3 3 0 0 0-2 5.2A3 3 0 0 0 6.5 17a3 3 0 0 0 3 3 2.5 2.5 0 0 0 2.5-2.5V5.5A2.5 2.5 0 0 0 9.5 3Z" />
            <path d="M14.5 3a3 3 0 0 1 3 3 3 3 0 0 1 2 5.2A3 3 0 0 1 17.5 17a3 3 0 0 1-3 3 2.5 2.5 0 0 1-2.5-2.5V5.5A2.5 2.5 0 0 1 14.5 3Z" />
            <path d="M6.5 6h.5" />
            <path d="M17 6h.5" />
            <path d="M5 11.2h1.5" />
            <path d="M17.5 11.2H19" />
          </svg>
        ) : data.label === "Harbor" ? (
          <img
            src="/images/logos/harbor-logo.svg"
            alt="Harbor"
            className="h-3 w-auto object-contain"
          />
        ) : data.label === "Sui" ? (
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 2C12 2 5 9 5 14a7 7 0 1014 0c0-5-7-12-7-12z" />
          </svg>
        ) : wfType === "import-agent" ? (
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
            <path d="M7 10l5 5 5-5" />
            <path d="M12 15V3" />
          </svg>
        ) : wfType === "delegate" ? (
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="9" cy="7" r="3" />
            <path d="M3 21v-2a4 4 0 014-4h2" />
            <path d="M16 11l2 2 4-4" />
          </svg>
        ) : wfType === "call-sub-agent" ? (
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="6" cy="6" r="3" />
            <circle cx="18" cy="18" r="3" />
            <path d="M9 6h6a3 3 0 013 3v6" />
          </svg>
        ) : wfType === "attest" ? (
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M9 12l2 2 4-4" />
            <path d="M12 3l7 4v5c0 4.5-3 7-7 9-4-2-7-4.5-7-9V7z" />
          </svg>
        ) : wfType === "memory-recall" ? (
          <svg
            width="28"
            height="28"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="8,5 19,12 8,19" />
          </svg>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-pure-black/30 !bg-white"
      />

      <p className="mt-3 text-center font-mono text-xs font-bold text-black">
        {data.label}
      </p>
      {data.subtitle && (
        <p className="text-center font-mono text-[10px] text-black/50">
          {data.subtitle}
        </p>
      )}

      {/* Explorer links once a node has settled with on-chain / storage output */}
      {data.status === "done" && (data.txDigest || data.blobId) && (
        <div className="mt-1 flex items-center gap-2">
          {data.txDigest && (
            <a
              href={suiscanTxUrl(data.txDigest)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-[9px] font-bold text-electric-purple underline hover:opacity-70"
              title="View transaction on Suiscan"
            >
              tx ↗
            </a>
          )}
          {data.blobId && (
            <a
              href={walruscanBlobUrl(data.blobId)}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="font-mono text-[9px] font-bold text-blue-600 underline hover:opacity-70"
              title="View blob on Walruscan"
            >
              blob ↗
            </a>
          )}
        </div>
      )}

      {/* Inline output chip — WHAT this node produced (DONE nodes only). Click
          to expand the structured detail popover. */}
      {outputSummary && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setShowDetail((p) => !p);
          }}
          title="Click to view full output"
          className="nodrag mt-1 max-w-[160px] truncate border border-green-600/40 bg-green-50 px-1.5 py-0.5 font-mono text-[9px] font-bold text-green-800 hover:border-green-600"
        >
          {outputSummary}
        </button>
      )}

      {/* Expandable output detail popover (structured fields + catalog/
          objectChanges/recall + raw JSON with copy). */}
      {outputDetail && (
        <NodeOutputDetailPopover
          label={data.label}
          detail={outputDetail}
          rawOutput={data.output}
          onClose={() => setShowDetail(false)}
        />
      )}

      {/* Pre-run preflight badge (shown only before a result lands) */}
      {!hasStatus && data.preflight && data.preflight.outcome !== "will-run" && (
        <div
          className={`mt-1 max-w-[160px] truncate border px-1.5 py-0.5 font-mono text-[9px] font-bold ${preflightColor(
            data.preflight.outcome,
          )}`}
          title={`${data.preflight.outcome}: ${data.preflight.reason}`}
        >
          {preflightGlyph(data.preflight.outcome)}{" "}
          {data.preflight.outcome === "will-error" ? "will error" : "will skip"}
        </div>
      )}

      {/* Per-node error caption — full text on hover */}
      {data.status === "error" && (data.cause || data.error) && (
        <p
          className="mt-1 max-w-[160px] truncate text-center font-mono text-[9px] text-red-600"
          title={`${data.cause ?? ""}${data.remediation ? ` — ${data.remediation}` : ""}\n\n${data.error ?? ""}`}
        >
          {(data.cause ?? data.error ?? "").slice(0, 60)}
        </p>
      )}

      {/* Per-node skip note (neutral) / pending (blocked) note */}
      {data.status === "skipped" && (
        <p
          className="mt-1 max-w-[160px] truncate text-center font-mono text-[9px] text-blue-700/70"
          title={data.cause ?? ""}
        >
          skipped{data.cause ? ` — ${data.cause.slice(0, 40)}` : ""}
        </p>
      )}
      {data.status === "pending" && (
        <p className="mt-1 text-center font-mono text-[9px] italic text-black/40">
          blocked by upstream
        </p>
      )}

      {/* Inline per-node config — edits flow into the run POST body */}
      {editing && paramFields.length > 0 && (
        <div
          className="nodrag nowheel absolute left-1/2 top-[110%] z-30 w-64 -translate-x-1/2 space-y-2 border-2 border-pure-black bg-white p-3 shadow-[3px_3px_0_0_#000]"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between">
            <p className="font-mono text-[10px] font-bold uppercase text-black/50">
              {data.label} config
            </p>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="font-mono text-xs font-bold text-black/40 hover:text-black"
              title="Close"
            >
              &times;
            </button>
          </div>
          {formNote && (
            <p className="border-l-2 border-electric-purple bg-surface-container px-2 py-1 font-mono text-[9px] leading-relaxed text-black/60">
              {formNote}
            </p>
          )}
          {paramFields.map((f) => (
            <NodeConfigField
              key={f.key}
              field={f}
              nodeId={id}
              value={
                f.key === LABEL_FIELD_KEY
                  ? (data.subtitle ?? "")
                  : (data.params?.[f.key] ?? "")
              }
              error={fieldErrors[f.key]}
              knownNamespaces={knownNamespaces}
              onChange={(v) =>
                f.key === LABEL_FIELD_KEY ? setCaption(v) : setParam(f.key, v)
              }
            />
          ))}
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="w-full border-2 border-pure-black bg-electric-purple px-2 py-1 font-mono text-[10px] font-bold text-white shadow-[2px_2px_0_0_#000]"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = { skill: SkillNode };

// Known seeded skills per agent (see packages/frontend/registry.seed.json).
// A Call Sub-Agent node must target a REAL skill the agent owns — NOT the
// agent's own `.sui` name (resolveSkill would throw "Skill not found: <agent>").
const DEMO_SEEDED_SKILL_BY_AGENT: Record<string, string> = {
  alpha: "web-search.alpha.sui",
  "beta-agent": "sandbox-tool.beta-agent.sui",
  "walrus-bot": "walrus-read.walrus-bot.sui",
};

/** Resolve a Call Sub-Agent `skill` target for an agent name (mirror of the
 * template helper). Prefers a concrete seeded skill the agent owns so
 * `resolveSkill` succeeds; falls back to the bare `web-search` skill id. */
function demoDefaultSkillFor(agentName: string): string {
  const slug = agentName?.trim().replace(/\.sui$/, "").toLowerCase();
  return DEMO_SEEDED_SKILL_BY_AGENT[slug] ?? "web-search";
}

// Far-future absolute expiry (ms) for the demo delegation cap. The on-chain
// delegation::assert_valid / record_subagent_execution assert
// `clock.timestamp_ms() <= expiry_ms`, so `expiryMs: 0` would abort the
// delegated Call with E_EXPIRED. Year 2100 keeps the cap valid for any run.
const DEMO_EXPIRY_MS = "4102444800000"; // 2100-01-01T00:00:00Z

// ===== "Agents import agents" demo flow =====
// Trigger -> Import Agent -> Delegate -> Call Sub-Agent -> Attest.
// `selfName` is the current agent's .sui — used as a sensible default target so
// the graph runs against a real agent out of the box. The user can re-point the
// target via each node's inline config; values flow into the run POST.
function demoCoordinateGraph(selfName: string): {
  nodes: Node[];
  edges: Edge[];
} {
  const target = selfName || "alice.sui";
  const nodes: Node[] = [
    {
      id: "demo-trigger",
      type: "skill",
      position: { x: 60, y: 240 },
      data: { label: "Trigger", subtitle: "Manual start" },
    },
    {
      id: "demo-import",
      type: "skill",
      position: { x: 280, y: 240 },
      data: {
        label: "Import Agent",
        subtitle: "Read skill catalog",
        params: { agent: target },
      },
    },
    {
      id: "demo-delegate",
      type: "skill",
      position: { x: 500, y: 240 },
      data: {
        label: "Delegate",
        subtitle: "Grant cap",
        // Far-future expiry so the delegated Call's assert_valid /
        // record_subagent_execution don't abort with E_EXPIRED.
        params: { child: target, spendLimit: "0", expiryMs: DEMO_EXPIRY_MS },
      },
    },
    {
      id: "demo-call",
      type: "skill",
      position: { x: 720, y: 240 },
      data: {
        label: "Call Sub-Agent",
        subtitle: "Delegated exec",
        // Target a REAL seeded skill the agent owns (NOT `target`/the agent name
        // — resolveSkill would throw "Skill not found: <agent>.sui"). The
        // DelegationCap is threaded automatically from the upstream Delegate
        // node's output at run time, so the delegated accounting path runs.
        params: { skill: demoDefaultSkillFor(target), cost: "0" },
      },
    },
    {
      id: "demo-attest",
      type: "skill",
      position: { x: 940, y: 240 },
      data: {
        label: "Attest",
        subtitle: "Reputation",
        params: { kind: "review", score: "100", share: "true" },
      },
    },
  ];
  const edge = (id: string, source: string, target: string, label?: string): Edge => ({
    id,
    source,
    target,
    type: "smoothstep",
    style: { stroke: "#ec4899", strokeDasharray: "5 5" },
    ...(label
      ? {
          label,
          labelStyle: { fill: "#000", fontSize: 9, fontFamily: "monospace" },
        }
      : {}),
  });
  const edges: Edge[] = [
    edge("de1", "demo-trigger", "demo-import"),
    edge("de2", "demo-import", "demo-delegate", "GRANT"),
    edge("de3", "demo-delegate", "demo-call", "DELEGATED"),
    edge("de4", "demo-call", "demo-attest", "ATTEST"),
  ];
  return { nodes, edges };
}

// ===== Demo flow =====

const initialNodes: Node[] = [
  {
    id: "trigger",
    type: "skill",
    position: { x: 80, y: 250 },
    data: { label: "Trigger", subtitle: "Manual start" },
  },
  {
    id: "walrus-store",
    type: "skill",
    position: { x: 320, y: 250 },
    data: { label: "Walrus", subtitle: "Store file (Walrus)" },
  },
  {
    id: "harbor-seal",
    type: "skill",
    position: { x: 560, y: 150 },
    data: { label: "Harbor", subtitle: "Encrypt + store (DEMO)" },
  },
  {
    id: "sui-exec",
    type: "skill",
    position: { x: 560, y: 370 },
    data: { label: "Sui", subtitle: "Execute PTB" },
  },
  {
    id: "memory",
    type: "skill",
    position: { x: 800, y: 250 },
    data: { label: "Memory", subtitle: "Save to agent memory" },
  },
];

const initialEdges: Edge[] = [
  {
    id: "e1",
    source: "trigger",
    target: "walrus-store",
    type: "smoothstep",
    style: { stroke: "#6800FF", strokeDasharray: "5 5" },
  },
  {
    id: "e2",
    source: "walrus-store",
    target: "harbor-seal",
    type: "smoothstep",
    style: { stroke: "#6800FF", strokeDasharray: "5 5" },
    label: "ENCRYPT",
    labelStyle: { fill: "#000", fontSize: 9, fontFamily: "monospace" },
  },
  {
    id: "e3",
    source: "walrus-store",
    target: "sui-exec",
    type: "smoothstep",
    style: { stroke: "#f97316", strokeDasharray: "5 5" },
    label: "ON-CHAIN",
    labelStyle: { fill: "#000", fontSize: 9, fontFamily: "monospace" },
  },
  {
    id: "e4",
    source: "harbor-seal",
    target: "memory",
    type: "smoothstep",
    style: { stroke: "#6800FF", strokeDasharray: "5 5" },
  },
  {
    id: "e5",
    source: "sui-exec",
    target: "memory",
    type: "smoothstep",
    style: { stroke: "#f97316", strokeDasharray: "5 5" },
  },
];

// ===== Logs view (per-node cause + remediation + raw error) =====

function severityStyle(status: NodeStatus): {
  ring: string;
  badge: string;
  label: string;
} {
  switch (status) {
    case "error":
      return { ring: "border-red-600", badge: "bg-red-600 text-white", label: "ERROR" };
    case "skipped":
      return {
        ring: "border-blue-400",
        badge: "bg-blue-500 text-white",
        label: "SKIPPED",
      };
    case "pending":
      return {
        ring: "border-pure-black/20",
        badge: "bg-black/40 text-white",
        label: "BLOCKED",
      };
    case "done":
      return { ring: "border-green-500", badge: "bg-green-500 text-white", label: "DONE" };
    default:
      return { ring: "border-pure-black/20", badge: "bg-black/30 text-white", label: status.toUpperCase() };
  }
}

function LogsView({ steps, runTime }: { steps: StepResult[]; runTime: string }) {
  if (steps.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="font-mono text-xs italic text-black/40">
          No logs yet. Run the workflow to see per-node diagnostics.
        </p>
      </div>
    );
  }
  // Errors and skips first, then the rest.
  const order: Record<NodeStatus, number> = {
    error: 0,
    skipped: 1,
    pending: 2,
    running: 3,
    done: 4,
    idle: 5,
  };
  const sorted = [...steps].sort((a, b) => order[a.status] - order[b.status]);

  return (
    <div className="space-y-2 pb-2">
      {sorted.map((s) => {
        const sev = severityStyle(s.status);
        const cause = shortCause(s);
        const summary =
          s.status === "done" ? nodeOutputSummary(s.type, s.output) : undefined;
        const raw =
          s.error ??
          (s.output && typeof s.output === "object"
            ? JSON.stringify(s.output, null, 2)
            : undefined);
        return (
          <div
            key={s.nodeId}
            className={`border-2 ${sev.ring} bg-white p-3 shadow-[3px_3px_0_0_#000]`}
          >
            <div className="flex items-center gap-2">
              <span
                className={`px-1.5 py-0.5 font-mono text-[9px] font-bold ${sev.badge}`}
              >
                {sev.label}
              </span>
              <span className="font-mono text-xs font-bold text-black">
                {s.nodeId}
              </span>
              <span className="font-mono text-[10px] text-black/40">
                {TYPE_LABEL[s.type]}
              </span>
              {s.errorCode && (
                <span className="ml-auto font-mono text-[9px] font-bold text-black/40">
                  {s.errorCode}
                </span>
              )}
              <span className="font-mono text-[9px] text-black/30">{runTime}</span>
            </div>

            {cause && (
              <p className="mt-2 font-mono text-[11px] text-black">
                <span className="font-bold text-black/50">cause: </span>
                {cause}
              </p>
            )}
            {s.remediation && (
              <p className="mt-1 font-mono text-[11px] text-green-800">
                <span className="font-bold text-black/50">fix: </span>
                {s.remediation}
              </p>
            )}
            {summary && (
              <p className="mt-2 font-mono text-[11px] text-green-800">
                <span className="font-bold text-black/50">output: </span>
                {summary}
              </p>
            )}
            {raw && (
              <pre className="mt-2 max-h-24 overflow-auto whitespace-pre-wrap break-all border border-pure-black/10 bg-surface-container px-2 py-1 font-mono text-[9px] text-black/60">
                {raw}
              </pre>
            )}
            {(s.txDigest || s.blobId) && (
              <div className="mt-2 flex items-center gap-3">
                {s.txDigest && (
                  <a
                    href={suiscanTxUrl(s.txDigest)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[9px] font-bold text-electric-purple underline"
                  >
                    tx ↗
                  </a>
                )}
                {s.blobId && (
                  <a
                    href={walruscanBlobUrl(s.blobId)}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[9px] font-bold text-blue-600 underline"
                  >
                    blob ↗
                  </a>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ===== Page =====

export default function WorkflowEditorPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showTools, setShowTools] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);
  const [panelHeight, setPanelHeight] = useState(45);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // Templates dropdown (pick-and-run library) open state.
  const [showTemplates, setShowTemplates] = useState(false);
  // React Flow instance, captured on init so off-canvas handlers (load demo /
  // template) can re-center the view via `fitView` (the `fitView` prop only
  // fits on mount).
  const rfInstance = useRef<ReactFlowInstance<Node, Edge> | null>(null);
  // Tracks which slug we've already seeded the canvas for, so the per-agent
  // default graph loads exactly ONCE per agent on mount — it never clobbers
  // later user edits, a loaded template, or the Demo Graph.
  const seededSlug = useRef<string | null>(null);

  // ===== Run state =====
  const [runs, setRuns] = useState<RunRecord[]>([]);
  const [latestRun, setLatestRun] = useState<RunRecord | null>(null);
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [showRuns, setShowRuns] = useState(false);
  const [txFilter, setTxFilter] = useState<"all" | WfType>("all");
  // Bottom-panel view: metrics tables vs. the per-node Logs view.
  const [panelView, setPanelView] = useState<"metrics" | "logs">("metrics");
  // Preflight (predicted before a run) + the env-presence summary.
  const [preflight, setPreflight] = useState<PreflightPayload | null>(null);
  // Known Walrus-memory namespaces (registry-derived) for the memory-node
  // namespace picker. Element 0 is the default (the agent's `.sui` name).
  const [namespaces, setNamespaces] = useState<string[]>([]);

  const onConnect = useCallback(
    (connection: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...connection,
            type: "smoothstep",
            style: { stroke: "#6800FF", strokeDasharray: "5 5" },
          },
          eds,
        ),
      ),
    [setEdges],
  );

  // Apply a run's step statuses + structured diagnosis onto matching canvas
  // nodes (by id). Copies error/cause/remediation/output so the node box and the
  // Logs view can surface WHY a step failed/skipped — not just the word "error".
  const applySteps = useCallback(
    (steps: StepResult[]) => {
      setNodes((nds) =>
        nds.map((n) => {
          const step = steps.find((s) => s.nodeId === n.id);
          if (!step) return n;
          return {
            ...n,
            data: {
              ...(n.data as SkillNodeData),
              status: step.status,
              txDigest: step.txDigest,
              blobId: step.blobId,
              error: step.error,
              errorCode: step.errorCode,
              cause: step.cause ?? shortCause(step),
              remediation: step.remediation,
              output: step.output,
            },
          };
        }),
      );
    },
    [setNodes],
  );

  // Build the runnable {nodes, edges} graph from the current canvas, mapping
  // labels -> workflow types and forwarding only non-empty params. Shared by the
  // run POST and the preflight fetch so both predict/run the same graph.
  const buildRunnableGraph = useCallback(() => {
    const runnable: {
      id: string;
      type: WfType;
      label: string;
      params?: Record<string, string>;
    }[] = [];
    for (const n of nodes) {
      const nodeData = n.data as SkillNodeData;
      const type = LABEL_TO_TYPE[nodeData.label];
      if (!type) continue;
      const params = Object.fromEntries(
        Object.entries(nodeData.params ?? {}).filter(
          ([, v]) => typeof v === "string" && v.trim().length > 0,
        ),
      );
      runnable.push({
        id: n.id,
        type,
        label: nodeData.label,
        ...(Object.keys(params).length > 0 ? { params } : {}),
      });
    }
    const ids = new Set(runnable.map((n) => n.id));
    const graphEdges = edges
      .filter((e) => ids.has(e.source) && ids.has(e.target))
      .map((e) => ({ source: e.source, target: e.target }));
    return { nodes: runnable, edges: graphEdges };
  }, [nodes, edges]);

  // Fetch the per-node preflight prediction for the current graph and stamp it
  // onto each node (so the canvas shows "will error / will skip" BEFORE a run).
  const runPreflight = useCallback(async () => {
    const graph = buildRunnableGraph();
    if (graph.nodes.length === 0) {
      setPreflight(null);
      return;
    }
    try {
      const res = await fetch(
        `/api/workflows/${encodeURIComponent(slug)}/preflight`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ graph }),
        },
      );
      if (!res.ok) return;
      const payload = (await res.json()) as PreflightPayload;
      setPreflight(payload);
      const byId = new Map(payload.report.nodes.map((n) => [n.nodeId, n]));
      setNodes((nds) =>
        nds.map((n) => {
          const pf = byId.get(n.id);
          if (!pf) return n;
          return {
            ...n,
            data: { ...(n.data as SkillNodeData), preflight: pf },
          };
        }),
      );
    } catch {
      /* preflight is best-effort */
    }
  }, [buildRunnableGraph, slug, setNodes]);

  // Load the list of past runs for this agent.
  const fetchRuns = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/workflows/${encodeURIComponent(slug)}/runs`,
      );
      if (!res.ok) return;
      const data = await res.json();
      setRuns(Array.isArray(data?.runs) ? data.runs : []);
    } catch {
      /* ignore — runs are best-effort */
    }
  }, [slug]);

  // Load the agent's known memory namespaces (registry-derived; default first).
  // Memwal has no list-namespaces endpoint — this comes entirely from the
  // registry via /api/namespaces.
  const fetchNamespaces = useCallback(async () => {
    try {
      const res = await fetch(
        `/api/namespaces?agent=${encodeURIComponent(slug)}`,
      );
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data?.namespaces)) setNamespaces(data.namespaces);
    } catch {
      /* best-effort — the picker still accepts free-text */
    }
  }, [slug]);

  useEffect(() => {
    fetchRuns();
    fetchNamespaces();
  }, [fetchRuns, fetchNamespaces]);

  // Seed the canvas with this agent's DISTINCT default workflow on first load
  // (once per slug). Each known demo agent (@alpha, @beta-agent, @walrus-bot,
  // @defi-rebalancer, @sui-indexer) opens with an on-brand starter graph;
  // unknown slugs keep the generic default (initialNodes/initialEdges). The
  // Templates dropdown and Demo Graph button still override afterwards — this
  // guard only fires once per slug, so it never clobbers later edits.
  useEffect(() => {
    if (!slug || seededSlug.current === slug) return;
    seededSlug.current = slug;
    const graph = defaultGraphForSlug(slug);
    if (!graph) return; // unknown agent — leave the generic default in place.
    setNodes(graph.nodes);
    setEdges(graph.edges);
    setLatestRun(null);
    requestAnimationFrame(() => {
      rfInstance.current?.fitView({ padding: 0.2, duration: 300 });
    });
  }, [slug, setNodes, setEdges]);

  // Fetch the preflight prediction on mount and whenever the graph shape changes
  // (node/edge count). Debounced so dragging a node doesn't spam the endpoint.
  // Skipped while a run is in flight (the run result drives node status then).
  useEffect(() => {
    if (running) return;
    const t = setTimeout(() => {
      void runPreflight();
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, nodes.length, edges.length]);

  // Hydrate the canvas + metrics panel from a previously persisted run.
  const loadRun = useCallback(
    (run: RunRecord) => {
      applySteps(run.steps);
      setLatestRun(run);
      setShowRuns(false);
      setShowMetrics(true);
    },
    [applySteps],
  );

  // POST the current graph, then poll the run until it settles.
  const handleRun = useCallback(async () => {
    if (running) return;
    setRunError(null);

    const graph = buildRunnableGraph();
    if (graph.nodes.length === 0) {
      setRunError(
        "Add at least one runnable node (Trigger, Walrus, Harbor, Sui, Memory, Import Agent, Delegate, Call Sub-Agent, Attest).",
      );
      return;
    }

    const runnableIds = new Set(graph.nodes.map((n) => n.id));

    setRunning(true);
    // Optimistic: mark runnable nodes as running, clear prior results +
    // diagnosis + preflight stamps (they get re-applied from the run result).
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...(n.data as SkillNodeData),
          status: runnableIds.has(n.id)
            ? ("running" as NodeStatus)
            : ("idle" as NodeStatus),
          txDigest: undefined,
          blobId: undefined,
          error: undefined,
          errorCode: undefined,
          cause: undefined,
          remediation: undefined,
          output: undefined,
          preflight: undefined,
        },
      })),
    );

    // Only flips nodes that are STILL "running" (never overwrites a status the
    // server already reported), so a transport failure can't mislabel nodes that
    // actually settled.
    const markRunnableError = (message: string) =>
      setNodes((nds) =>
        nds.map((n) =>
          runnableIds.has(n.id) && (n.data as SkillNodeData).status === "running"
            ? {
                ...n,
                data: {
                  ...(n.data as SkillNodeData),
                  status: "error" as NodeStatus,
                  cause: message,
                },
              }
            : n,
        ),
      );

    try {
      const res = await fetch(`/api/workflows/${encodeURIComponent(slug)}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ graph }),
      });
      const payload = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = payload?.error ?? `Run failed (${res.status})`;
        setRunError(message);
        markRunnableError(message);
        return;
      }

      const runId: string = payload.runId;
      if (Array.isArray(payload.steps)) {
        applySteps(payload.steps);
        setLatestRun({
          runId,
          status: payload.status,
          steps: payload.steps,
          createdAt: new Date().toISOString(),
        });
      }
      setShowMetrics(true);

      // Poll until terminal. The server currently runs synchronously, so this
      // usually settles on the first read; the loop keeps it correct if the
      // engine ever becomes async.
      for (let i = 0; i < 15; i++) {
        await sleep(600);
        const r = await fetch(
          `/api/workflows/${encodeURIComponent(slug)}/runs/${encodeURIComponent(
            runId,
          )}`,
        );
        if (!r.ok) break;
        const { run } = await r.json();
        if (!run) break;
        applySteps(run.steps);
        setLatestRun(run);
        if (run.status === "done" || run.status === "error") break;
      }

      await fetchRuns();
      // A `memory` (remember) step may have recorded a new namespace — refresh
      // the picker list so the canvas offers it next time.
      await fetchNamespaces();
    } catch (e) {
      const message = e instanceof Error ? e.message : "Run failed";
      setRunError(message);
      markRunnableError(message);
    } finally {
      setRunning(false);
    }
  }, [
    running,
    buildRunnableGraph,
    slug,
    setNodes,
    applySteps,
    fetchRuns,
    fetchNamespaces,
  ]);

  // Load the "Agents import agents" demo graph onto the canvas, seeded with the
  // current agent's .sui as the default target.
  // Recenter the view after a graph swap. `<ReactFlow fitView>` only fits on
  // mount, so off-canvas handlers re-fit via the captured instance once React
  // Flow has measured the new nodes.
  const fitViewNextTick = useCallback(() => {
    requestAnimationFrame(() => {
      rfInstance.current?.fitView({ padding: 0.2, duration: 300 });
    });
  }, []);

  const loadDemoGraph = useCallback(() => {
    const selfName = slug.includes(".") ? slug : `${slug}.sui`;
    const { nodes: dNodes, edges: dEdges } = demoCoordinateGraph(selfName);
    setNodes(dNodes);
    setEdges(dEdges);
    setLatestRun(null);
    fitViewNextTick();
  }, [slug, setNodes, setEdges, fitViewNextTick]);

  // Load a ready-made template graph onto the canvas (same path as Demo Graph),
  // seeded with the current agent's `.sui` name.
  const loadTemplate = useCallback(
    (templateId: string) => {
      const tpl = TEMPLATES.find((t) => t.id === templateId);
      if (!tpl) return;
      const { nodes: tNodes, edges: tEdges } = tpl.build(slug);
      setNodes(tNodes);
      setEdges(tEdges);
      setLatestRun(null);
      setShowTemplates(false);
      fitViewNextTick();
    },
    [slug, setNodes, setEdges, fitViewNextTick],
  );

  // Drag to resize bottom panel
  const handleDragResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startY = e.clientY;
      const startH = panelHeight;
      const onMove = (ev: MouseEvent) => {
        const diff = startY - ev.clientY;
        const newH = Math.min(
          80,
          Math.max(20, startH + (diff / window.innerHeight) * 100),
        );
        setPanelHeight(newH);
      };
      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
      };
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [panelHeight],
  );

  // Toggle sidebar collapse — sends event to parent layout
  const toggleSidebar = () => {
    setSidebarCollapsed((prev) => !prev);
    document.dispatchEvent(
      new CustomEvent("toggle-sidebar", {
        detail: { collapsed: !sidebarCollapsed },
      }),
    );
  };

  // ===== Derived metrics from the latest run =====
  const steps = latestRun?.steps ?? [];
  const runTime = latestRun
    ? new Date(latestRun.createdAt).toLocaleTimeString()
    : "—";
  const doneCount = steps.filter((s) => s.status === "done").length;
  const txCount = steps.filter((s) => s.txDigest).length;
  const blobCount = steps.filter((s) => s.blobId).length;
  const filteredSteps =
    txFilter === "all" ? steps : steps.filter((s) => s.type === txFilter);
  // Per-tab counts for the LIVE TRANSACTIONS filter badges. `all` is the total.
  const txTypeCount = (val: "all" | WfType): number =>
    val === "all" ? steps.length : steps.filter((s) => s.type === val).length;
  // A run produced steps (used to distinguish "no run yet" from "this filter is
  // empty" in the LIVE TRANSACTIONS panel — mirrors MY ACTIVITY's steps.length).
  const hasRun = steps.length > 0;

  // ===== Preflight-derived warnings (shown before a run) =====
  const env = preflight?.env;
  const hardBlocker = preflight?.report.hasHardBlocker ?? false;
  // Env badges: only show the ones that matter (missing key / mainnet Walrus).
  const envWarnings: { label: string; tone: "error" | "warn" }[] = [];
  if (env) {
    if (!env.suiKey)
      envWarnings.push({ label: "env: SUI_PRIVATE_KEY missing", tone: "error" });
    if (!env.enokiKey)
      envWarnings.push({ label: "env: ENOKI_SECRET_KEY missing", tone: "error" });
    if (env.network === "mainnet" && !env.customWalrusPublisher)
      envWarnings.push({ label: "mainnet — no public Walrus publisher", tone: "warn" });
    if (!env.passportOnChain)
      envWarnings.push({
        label: "passport not on-chain (sui/delegate may skip)",
        tone: "warn",
      });
  }
  // The steps shown in the Logs view: errored / skipped / pending first.
  const logSteps = steps.filter(
    (s) =>
      s.status === "error" || s.status === "skipped" || s.status === "pending",
  );

  return (
    <NamespacesContext.Provider value={namespaces}>
    <div className="relative h-[calc(100vh-0px)] w-full overflow-hidden bg-off-white">
      {/* ===== Top bar ===== */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center border-b border-pure-black/10 bg-off-white/95 px-4 py-3 backdrop-blur-sm">
        {/* Left: sidebar toggle + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex h-7 w-7 items-center justify-center border-2 border-pure-black bg-white text-black hover:bg-surface-container"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              {sidebarCollapsed ? (
                <>
                  <path d="M3 3h18v18H3z" />
                  <path d="M9 3v18" />
                  <path d="M14 12l3-3m0 0l3 3m-3-3v6" />
                </>
              ) : (
                <>
                  <path d="M3 3h18v18H3z" />
                  <path d="M9 3v18" />
                  <path d="M15 9l-3 3 3 3" />
                </>
              )}
            </svg>
          </button>
          <nav className="flex items-center gap-1 font-mono text-sm text-black">
            <Link href="/create" className="text-black/50 hover:text-black">
              Workflows
            </Link>
            <span className="text-black/30">/</span>
            <span className="font-bold text-black">@{slug}</span>
          </nav>
        </div>

        {/* Center: ▶ Runs dropdown */}
        <div className="relative flex-1 text-center">
          <button
            type="button"
            onClick={() => {
              setShowRuns((p) => !p);
              if (!showRuns) fetchRuns();
            }}
            className="font-mono text-sm font-bold text-black transition-colors hover:text-electric-purple"
          >
            ▶ Runs ({runs.length})
          </button>
          {showRuns && (
            <div className="absolute left-1/2 top-8 z-30 max-h-80 w-72 -translate-x-1/2 overflow-y-auto border-2 border-pure-black bg-white text-left shadow-[4px_4px_0_0_#000]">
              <div className="border-b-2 border-pure-black px-3 py-2 font-mono text-[10px] font-bold uppercase text-black/50">
                Past Runs
              </div>
              {runs.length === 0 ? (
                <p className="px-3 py-4 text-center font-mono text-xs italic text-black/40">
                  No runs yet.
                </p>
              ) : (
                runs.map((run) => (
                  <button
                    key={run.runId}
                    type="button"
                    onClick={() => loadRun(run)}
                    className="flex w-full items-center gap-2 border-b border-pure-black/10 px-3 py-2 text-left hover:bg-surface-container"
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${run.status === "done" ? "bg-green-500" : "bg-red-500"}`}
                    />
                    <span className="flex-1 font-mono text-xs font-bold text-black">
                      {run.runId.slice(0, 8)}
                    </span>
                    <span className="font-mono text-[10px] text-black/50">
                      {run.steps.length} steps
                    </span>
                    <span className="font-mono text-[10px] text-black/40">
                      {new Date(run.createdAt).toLocaleTimeString()}
                    </span>
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* Right: preflight badges + run + tools */}
        <div className="flex items-center gap-2">
          {/* Env preflight badge strip (predicted before a run) */}
          {envWarnings.length > 0 && (
            <div className="hidden items-center gap-1 lg:flex">
              {envWarnings.map((w) => (
                <span
                  key={w.label}
                  className={`border-2 px-2 py-0.5 font-mono text-[10px] font-bold ${
                    w.tone === "error"
                      ? "border-red-600 bg-red-50 text-red-700"
                      : "border-amber-500 bg-amber-50 text-amber-700"
                  }`}
                  title={w.label}
                >
                  {w.tone === "error" ? "✕ " : "⚠ "}
                  {w.label}
                </span>
              ))}
            </div>
          )}
          {/* Templates: pick-and-run library of ready-made workflows. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowTemplates((v) => !v)}
              disabled={running}
              aria-haspopup="menu"
              aria-expanded={showTemplates}
              className="flex items-center gap-1.5 border-2 border-pure-black bg-white px-3 py-1.5 font-mono text-xs font-bold text-black shadow-[2px_2px_0_0_#000] transition-all hover:-translate-y-0.5 hover:border-electric-purple disabled:cursor-not-allowed disabled:opacity-60"
              title="Load a ready-made workflow template"
            >
              Templates
              <span className="text-[10px]">{showTemplates ? "▲" : "▼"}</span>
            </button>
            {showTemplates && (
              <>
                {/* Click-away backdrop. */}
                <div
                  className="fixed inset-0 z-30"
                  onClick={() => setShowTemplates(false)}
                />
                <div
                  role="menu"
                  className="absolute right-0 z-40 mt-2 w-80 border-2 border-pure-black bg-white shadow-[4px_4px_0_0_#000]"
                >
                  <div className="border-b-2 border-pure-black bg-electric-purple px-3 py-2 font-mono text-[11px] font-bold uppercase tracking-wide text-white">
                    Templates
                  </div>
                  <div className="max-h-[60vh] overflow-y-auto">
                    {templatesByCategory().map((group) => (
                      <div key={group.category}>
                        <div className="sticky top-0 z-10 border-b border-pure-black/10 bg-surface-container px-3 py-1 font-mono text-[9px] font-bold uppercase tracking-wider text-black/45">
                          {group.category}
                        </div>
                        {group.templates.map((tpl) => (
                          <button
                            key={tpl.id}
                            type="button"
                            role="menuitem"
                            onClick={() => loadTemplate(tpl.id)}
                            title={tpl.demonstrates}
                            className="block w-full border-b border-pure-black/10 px-3 py-2 text-left transition-colors last:border-b-0 hover:bg-surface-container"
                          >
                            <div className="font-mono text-xs font-bold text-black">
                              {tpl.name}
                            </div>
                            <div className="mt-0.5 font-mono text-[10px] leading-snug text-black/55">
                              {tpl.description}
                            </div>
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            type="button"
            onClick={loadDemoGraph}
            disabled={running}
            className="flex items-center gap-1.5 border-2 border-pure-black bg-white px-3 py-1.5 font-mono text-xs font-bold text-black shadow-[2px_2px_0_0_#000] transition-all hover:-translate-y-0.5 hover:border-pink-500 disabled:cursor-not-allowed disabled:opacity-60"
            title="Load the Agents-import-agents coordination demo"
          >
            Demo Graph
          </button>
          <button
            type="button"
            onClick={() => {
              // Warn-gate: if an on-chain node will error purely on missing
              // server env, surface it BEFORE the run instead of as a cryptic
              // red node. The run still proceeds (user may have a reason).
              if (hardBlocker && !running) {
                const missing = !env?.suiKey
                  ? "SUI_PRIVATE_KEY"
                  : "ENOKI_SECRET_KEY";
                setRunError(
                  `${missing} not set — on-chain steps will error. Add it to packages/frontend/.env.local (or the repo-root .env reaching the route). Running anyway…`,
                );
              }
              void handleRun();
            }}
            disabled={running}
            className={`flex items-center gap-1.5 border-2 border-pure-black px-3 py-1.5 font-mono text-xs font-bold text-white shadow-[2px_2px_0_0_#000] transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 ${
              hardBlocker ? "bg-red-600" : "bg-electric-purple"
            }`}
            title={
              hardBlocker
                ? "Missing server signing env — on-chain steps will error"
                : "Run the workflow"
            }
          >
            {running ? (
              <>
                <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
                Running…
              </>
            ) : (
              <>▶ Run Workflow</>
            )}
          </button>
          <button
            type="button"
            onClick={() => setShowTools(!showTools)}
            className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-pure-black bg-white text-lg text-black transition-all hover:border-electric-purple hover:text-electric-purple"
          >
            +
          </button>
        </div>
      </div>

      {/* ===== Run error banner ===== */}
      {runError && (
        <div className="absolute left-1/2 top-16 z-30 flex -translate-x-1/2 items-center gap-3 border-2 border-red-600 bg-red-50 px-4 py-2 font-mono text-xs font-bold text-red-700 shadow-[3px_3px_0_0_#000]">
          <span>{runError}</span>
          <button
            type="button"
            onClick={() => setRunError(null)}
            className="text-red-700/60 hover:text-red-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* ===== Canvas ===== */}
      <div
        className="absolute inset-0 pt-[52px]"
        style={{ paddingBottom: showMetrics ? `${panelHeight}vh` : 0 }}
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={(instance) => {
            rfInstance.current = instance;
          }}
          nodeTypes={nodeTypes}
          fitView
          deleteKeyCode={["Backspace", "Delete"]}
          className="bg-off-white"
          defaultEdgeOptions={{
            type: "smoothstep",
            style: { stroke: "#6800FF", strokeDasharray: "5 5" },
          }}
        >
          <Background color="#e8e4df" gap={24} size={1} />
          <Controls className="[&_button]:!border-2 [&_button]:!border-pure-black/20 [&_button]:!bg-white [&_button]:!text-black" />
        </ReactFlow>
      </div>

      {/* ===== Bottom panel (neo-brutalist, resizable) ===== */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        {/* Drag handle */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowMetrics(!showMetrics)}
            onMouseDown={showMetrics ? handleDragResize : undefined}
            className="relative -top-3 flex h-6 w-16 cursor-ns-resize items-center justify-center rounded-full border-2 border-pure-black bg-white text-black shadow-[2px_2px_0_0_#000] transition-colors hover:bg-electric-purple hover:text-white"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showMetrics ? "" : "rotate-180"}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>

        {showMetrics && (
          <div
            style={{ height: `${panelHeight}vh` }}
            className="overflow-y-auto border-t-2 border-pure-black bg-off-white px-6 py-4"
          >
            {/* Panel view tabs: metrics tables vs. per-node Logs */}
            <div className="mb-3 flex items-center gap-2">
              {(
                [
                  ["metrics", "METRICS"],
                  ["logs", "LOGS"],
                ] as const
              ).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setPanelView(val)}
                  className={`border-2 px-3 py-1 font-mono text-[10px] font-bold uppercase ${
                    panelView === val
                      ? "border-electric-purple bg-electric-purple text-white shadow-[2px_2px_0_0_#000]"
                      : "border-pure-black/20 bg-white text-black hover:border-electric-purple"
                  }`}
                >
                  {label}
                  {val === "logs" && logSteps.length > 0 && (
                    <span className="ml-1.5 inline-flex h-4 min-w-4 items-center justify-center bg-red-600 px-1 text-[9px] text-white">
                      {logSteps.length}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {panelView === "logs" ? (
              <LogsView steps={steps} runTime={runTime} />
            ) : (
            <div className="grid h-full grid-cols-3 gap-4">
              {/* Run summary (real, derived from latest run) */}
              <div className="flex flex-col gap-4">
                <div className="border-2 border-pure-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-mono text-xs font-bold text-black">
                      RUN SUMMARY
                    </h4>
                    <span
                      className={`font-mono text-[10px] font-bold ${running ? "text-green-700" : "text-black/40"}`}
                    >
                      {running
                        ? "● RUNNING"
                        : latestRun
                          ? `● ${latestRun.status.toUpperCase()}`
                          : "● IDLE"}
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="font-mono text-[10px] text-black/50">
                        STEPS
                      </p>
                      <p className="font-mono text-lg font-bold text-black">
                        {steps.length}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-black/50">DONE</p>
                      <p className="font-mono text-lg font-bold text-black">
                        {doneCount}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-black/50">
                        ON-CHAIN TX
                      </p>
                      <p className="font-mono text-lg font-bold text-black">
                        {txCount}
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-black/50">
                        BLOBS
                      </p>
                      <p className="font-mono text-lg font-bold text-black">
                        {blobCount}
                      </p>
                    </div>
                  </div>
                </div>
                <div className="border-2 border-pure-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-mono text-xs font-bold text-black">
                      LAST RUN
                    </h4>
                    <span
                      className={`font-mono text-[10px] font-bold ${running ? "text-green-700" : "text-black/40"}`}
                    >
                      {running ? "● LIVE" : "○"}
                    </span>
                  </div>
                  {latestRun ? (
                    <p className="font-mono text-sm text-black/60">
                      <span className="text-lg font-bold text-black">
                        {latestRun.runId.slice(0, 8)}
                      </span>{" "}
                      · {runTime}
                    </p>
                  ) : (
                    <p className="font-mono text-sm italic text-black/40">
                      No runs yet. Hit Run Workflow.
                    </p>
                  )}
                </div>
              </div>

              {/* Live Transactions (real, from run steps) */}
              <div className="border-2 border-pure-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
                <h4 className="mb-2 font-mono text-xs font-bold text-black">
                  LIVE TRANSACTIONS
                </h4>
                <div className="mb-3 flex flex-wrap gap-2">
                  {(
                    [
                      ["all", "All"],
                      ["walrus", "Walrus"],
                      ["harbor", "Harbor"],
                      ["sui", "Sui PTB"],
                      ["memory", "Memory"],
                      ["memory-recall", "Recall"],
                      ["import-agent", "Import"],
                      ["delegate", "Delegate"],
                      ["call-sub-agent", "Sub-Call"],
                      ["attest", "Attest"],
                    ] as const
                  ).map(([val, label]) => {
                    const count = txTypeCount(val);
                    const zero = hasRun && count === 0;
                    return (
                      <button
                        key={val}
                        type="button"
                        onClick={() => setTxFilter(val)}
                        className={`border-2 px-2 py-0.5 font-mono text-[10px] font-bold ${
                          txFilter === val
                            ? "border-electric-purple bg-electric-purple/10 text-black"
                            : zero
                              ? "border-pure-black/10 text-black/30 hover:border-electric-purple"
                              : "border-pure-black/20 text-black hover:border-electric-purple"
                        }`}
                      >
                        {label}
                        {hasRun && (
                          <span
                            className={
                              zero ? "ml-1 text-black/20" : "ml-1 text-black/40"
                            }
                          >
                            ({count})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
                <div className="mb-1 flex items-center justify-between border-b-2 border-pure-black/10 pb-1 font-mono text-[9px] font-bold uppercase text-black/50">
                  <span className="flex-1">Node</span>
                  <span className="w-16">Type</span>
                  <span className="w-16">Status</span>
                  <span className="w-14 text-right">Link</span>
                </div>
                {!hasRun ? (
                  // (a) No run yet — keyed on the FULL steps array, like MY ACTIVITY.
                  <p className="mt-4 text-center font-mono text-xs italic text-black/40">
                    No transactions yet. Run the workflow.
                  </p>
                ) : filteredSteps.length === 0 ? (
                  // (b) A run happened, but this filter matched nothing.
                  <div className="mt-4 flex flex-col items-center gap-2">
                    <p className="text-center font-mono text-xs italic text-black/40">
                      No {txFilter === "all" ? "" : `${TYPE_LABEL[txFilter]} `}
                      steps in this run.
                    </p>
                    <button
                      type="button"
                      onClick={() => setTxFilter("all")}
                      className="border-2 border-pure-black bg-white px-2 py-0.5 font-mono text-[10px] font-bold text-black shadow-[2px_2px_0_0_#000] hover:bg-surface-container"
                    >
                      Show All ({steps.length})
                    </button>
                  </div>
                ) : (
                  // (c) Rows.
                  <div className="space-y-1.5">
                    {filteredSteps.map((s) => {
                      const cause = shortCause(s);
                      return (
                        <div key={s.nodeId} className="font-mono text-[10px]">
                          <div className="flex items-center justify-between">
                            <span className="flex-1 truncate text-black/60">
                              {s.nodeId}
                            </span>
                            <span className="w-16 text-black">
                              {TYPE_LABEL[s.type]}
                            </span>
                            <span
                              className={`w-16 font-bold ${statusLabelColor(s.status)}`}
                            >
                              {s.status === "pending" ? "blocked" : s.status}
                            </span>
                            <span className="w-14 text-right">
                              {s.txDigest ? (
                                <a
                                  href={suiscanTxUrl(s.txDigest)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-bold text-electric-purple underline"
                                >
                                  tx ↗
                                </a>
                              ) : s.blobId ? (
                                <a
                                  href={walruscanBlobUrl(s.blobId)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-bold text-blue-600 underline"
                                >
                                  blob ↗
                                </a>
                              ) : (
                                <span className="text-black/30">—</span>
                              )}
                            </span>
                          </div>
                          {(s.status === "error" || s.status === "skipped") &&
                            cause && (
                              <p
                                className={`mt-0.5 truncate text-[9px] ${s.status === "error" ? "text-red-600" : "text-blue-700/60"}`}
                                title={`${cause}${s.remediation ? ` — ${s.remediation}` : ""}`}
                              >
                                ↳ {cause}
                              </p>
                            )}
                          {s.status === "done" &&
                            (() => {
                              const summary = nodeOutputSummary(s.type, s.output);
                              return summary ? (
                                <p
                                  className="mt-0.5 truncate text-[9px] text-green-700"
                                  title={summary}
                                >
                                  ↳ {summary}
                                </p>
                              ) : null;
                            })()}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* My Activity (real, from run steps) */}
              <div className="border-2 border-pure-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
                <h4 className="mb-2 font-mono text-xs font-bold text-black">
                  MY ACTIVITY
                </h4>
                <div className="mb-1 flex items-center justify-between border-b-2 border-pure-black/10 pb-1 font-mono text-[9px] font-bold uppercase text-black/50">
                  <span className="w-16">Time</span>
                  <span className="flex-1">Type</span>
                  <span className="w-16">Status</span>
                  <span className="w-14 text-right">Link</span>
                </div>
                {steps.length === 0 ? (
                  <p className="mt-4 text-center font-mono text-xs italic text-black/40">
                    No activity yet.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {steps.map((s) => {
                      const cause = shortCause(s);
                      return (
                        <div key={s.nodeId} className="font-mono text-[10px]">
                          <div className="flex items-center justify-between">
                            <span className="w-16 text-black/50">{runTime}</span>
                            <span className="flex-1 text-black">
                              {TYPE_LABEL[s.type]}
                            </span>
                            <span
                              className={`w-16 font-bold ${statusLabelColor(s.status)}`}
                            >
                              {s.status === "pending" ? "blocked" : s.status}
                            </span>
                            <span className="w-14 text-right">
                              {s.txDigest ? (
                                <a
                                  href={suiscanTxUrl(s.txDigest)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-bold text-electric-purple underline"
                                >
                                  tx ↗
                                </a>
                              ) : s.blobId ? (
                                <a
                                  href={walruscanBlobUrl(s.blobId)}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="font-bold text-blue-600 underline"
                                >
                                  blob ↗
                                </a>
                              ) : (
                                <span className="text-black/30">—</span>
                              )}
                            </span>
                          </div>
                          {(s.status === "error" || s.status === "skipped") &&
                            cause && (
                              <p
                                className={`mt-0.5 truncate text-[9px] ${s.status === "error" ? "text-red-600" : "text-blue-700/60"}`}
                                title={cause}
                              >
                                ↳ {cause}
                              </p>
                            )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
            )}
          </div>
        )}
      </div>

      {/* ===== Tools Panel (right side) ===== */}
      {showTools && (
        <div className="absolute right-0 top-0 z-20 flex h-full w-72 flex-col border-l-2 border-pure-black bg-off-white shadow-[-4px_0_0_0_#000]">
          <div className="flex items-center justify-between border-b-2 border-pure-black px-4 py-3">
            <h3 className="font-mono text-sm font-bold text-black">TOOLS</h3>
            <button
              type="button"
              onClick={() => setShowTools(false)}
              className="text-black/50 hover:text-black"
            >
              ✕
            </button>
          </div>
          <div className="border-b border-pure-black/10 px-4 py-3">
            <input
              type="search"
              placeholder="Search..."
              className="w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-xs text-black outline-none placeholder:text-black/40 focus:border-electric-purple"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-pure-black/10 px-4 py-2">
              <p className="font-mono text-[10px] font-bold uppercase text-black/50">
                In This Workflow ({nodes.length})
              </p>
            </div>
            <div className="border-b-2 border-electric-purple bg-electric-purple/10 px-4 py-2">
              <p className="font-mono text-[10px] font-bold uppercase text-black">
                All Tools
              </p>
            </div>

            <div className="space-y-1 p-2">
              {[
                {
                  category: "storage",
                  tools: [
                    { label: "Walrus", subtitle: "Store file (Walrus)" },
                    { label: "Memory", subtitle: "Save to agent memory" },
                    { label: "Memory Recall", subtitle: "Recall agent memory" },
                  ],
                  count: 3,
                },
                {
                  category: "security",
                  tools: [{ label: "Harbor", subtitle: "Encrypt + store (DEMO)" }],
                  count: 1,
                },
                {
                  category: "blockchain",
                  tools: [{ label: "Sui", subtitle: "Execute PTB" }],
                  count: 1,
                },
                {
                  category: "coordination",
                  tools: COORDINATE_TOOLS,
                  count: COORDINATE_TOOLS.length,
                },
                {
                  category: "triggers",
                  tools: [{ label: "Trigger", subtitle: "Manual start" }],
                  count: 1,
                },
              ].map((cat) => (
                <details
                  key={cat.category}
                  className="border-2 border-pure-black/20 bg-white"
                >
                  <summary className="flex cursor-pointer items-center justify-between px-3 py-3 font-mono text-sm font-bold text-black hover:bg-surface-container">
                    {cat.category}
                    <span className="flex h-5 w-5 items-center justify-center bg-electric-purple font-mono text-[10px] font-bold text-white">
                      {cat.count}
                    </span>
                  </summary>
                  <div className="space-y-1 border-t border-pure-black/10 p-2">
                    {cat.tools.map((tool) => (
                      <div
                        key={tool.label}
                        onClick={() => {
                          setNodes((nds) => [
                            ...nds,
                            {
                              id: `${tool.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-${Date.now()}`,
                              type: "skill",
                              position: {
                                x: 300 + Math.random() * 200,
                                y: 200 + Math.random() * 150,
                              },
                              data: {
                                label: tool.label,
                                subtitle: tool.subtitle,
                              },
                            },
                          ]);
                        }}
                        className="flex cursor-pointer items-center gap-3 border-2 border-pure-black bg-white px-3 py-2 transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#6800FF]"
                      >
                        <span className="font-mono text-lg font-bold text-black">
                          {tool.label.charAt(0)}
                        </span>
                        <div>
                          <p className="font-mono text-xs font-bold text-black">
                            {tool.label}
                          </p>
                          <p className="font-mono text-[10px] text-black/50">
                            {tool.subtitle}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
    </NamespacesContext.Provider>
  );
}
