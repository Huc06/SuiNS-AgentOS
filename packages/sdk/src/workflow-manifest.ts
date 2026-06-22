/**
 * Workflow manifest (`sui-agent-workflow/v1`).
 *
 * A workflow is "many skills composed into one" — a DAG of nodes (the same node
 * kinds the visual canvas renders) wired by edges, published under an agent as
 * its OWN SuiNS subname (e.g. `rebalance-pipeline.alpha-fund.sui`). It mirrors
 * the skill manifest pattern (`sui-agent-skill/v1`) so the existing
 * Walrus-upload + on-chain + SuiNS-subname infrastructure is reused: the full
 * graph is serialized deterministically, hashed (SHA-256), and stored on Walrus
 * as a blob. Discovery/resolution then works exactly like a skill — by name —
 * except the engine sees `manifestType === "sui-agent-workflow/v1"` and runs the
 * graph step-by-step instead of a single Move entry call.
 *
 * Kept intentionally parallel to `./manifest.ts` (skill manifests): same
 * deterministic-serialize → stable-hash contract, so a workflow blob verifies
 * the same way a skill blob does.
 */
import type { WorkflowGraph, WorkflowNodeType } from "./workflow/types.js";
import { computeManifestHash } from "./manifest.js";

export const WORKFLOW_MANIFEST_TYPE = "sui-agent-workflow/v1";

/** The node kinds a workflow graph may contain (mirrors the engine). */
const WORKFLOW_NODE_TYPES: ReadonlySet<WorkflowNodeType> = new Set([
  "trigger",
  "walrus",
  "harbor",
  "sui",
  "memory",
  "memory-recall",
  "import-agent",
  "call-sub-agent",
  "delegate",
  "attest",
]);

/**
 * A published workflow: a composition of skills/steps stored as a single blob.
 *
 * - `name` / `version` / `publisher` mirror the skill manifest header so the
 *   registry record + SuiNS subname format identically.
 * - `graph` is the full DAG the engine runs.
 * - `dependencies` lists the SuiNS subnames of skills/sub-agents the graph
 *   composes (so dependency resolution + discovery can surface them), e.g.
 *   `["defi-rebalancer.alpha-fund.sui", "portfolio-tracker.alpha-fund.sui"]`.
 */
export interface WorkflowManifest {
  name: string;
  version: string;
  publisher: string;
  manifestType: typeof WORKFLOW_MANIFEST_TYPE;
  /** Optional human-readable summary shown in catalogs/cards. */
  description?: string;
  /** The full workflow DAG: nodes + edges. */
  graph: WorkflowGraph;
  /** SuiNS subnames of skills/sub-agents this workflow composes. */
  dependencies: string[];
}

/** Recursively sort object keys so serialization is byte-stable (stable hash). */
function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortValue);
  }
  if (value !== null && typeof value === "object") {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      sorted[key] = sortValue((value as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return value;
}

/**
 * Serialize a WorkflowManifest to deterministic JSON bytes (recursively sorted
 * keys), so repeated serializations of the same manifest are byte-identical and
 * therefore hash identically.
 */
export function serializeWorkflowManifest(
  manifest: WorkflowManifest,
): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(sortValue(manifest)));
}

/**
 * Compute the hex SHA-256 of a serialized workflow manifest. Reuses the shared
 * skill-manifest hasher so workflow + skill blobs verify identically.
 */
export function computeWorkflowManifestHash(data: Uint8Array): string {
  return computeManifestHash(data);
}

/**
 * Validate a `sui-agent-workflow/v1` manifest. Throws on a wrong manifestType,
 * a missing required field, or a malformed graph (empty/invalid nodes, an edge
 * referencing an unknown node id, or an unsupported node type).
 */
export function validateWorkflowManifest(
  manifest: WorkflowManifest,
): void {
  if (manifest === null || typeof manifest !== "object") {
    throw new Error("Invalid workflow manifest: expected an object");
  }
  if (manifest.manifestType !== WORKFLOW_MANIFEST_TYPE) {
    throw new Error(
      `Invalid manifestType: ${String(manifest.manifestType)}. Expected ${WORKFLOW_MANIFEST_TYPE}`,
    );
  }

  for (const field of ["name", "version", "publisher", "graph"] as const) {
    if (manifest[field] === undefined || manifest[field] === null) {
      throw new Error(
        `Invalid workflow manifest: missing required field "${field}"`,
      );
    }
  }

  const graph = manifest.graph;
  if (!Array.isArray(graph.nodes) || graph.nodes.length === 0) {
    throw new Error("Invalid workflow manifest: graph.nodes must be non-empty");
  }
  if (!Array.isArray(graph.edges)) {
    throw new Error("Invalid workflow manifest: graph.edges must be an array");
  }

  const ids = new Set<string>();
  for (const node of graph.nodes) {
    if (!node || typeof node.id !== "string" || node.id.length === 0) {
      throw new Error("Invalid workflow manifest: every node needs an id");
    }
    if (ids.has(node.id)) {
      throw new Error(`Invalid workflow manifest: duplicate node id "${node.id}"`);
    }
    ids.add(node.id);
    if (!WORKFLOW_NODE_TYPES.has(node.type)) {
      throw new Error(
        `Invalid workflow manifest: unsupported node type "${String(node.type)}"`,
      );
    }
    if (typeof node.label !== "string" || node.label.length === 0) {
      throw new Error(
        `Invalid workflow manifest: node "${node.id}" needs a label`,
      );
    }
  }

  for (const edge of graph.edges) {
    if (!edge || typeof edge.source !== "string" || typeof edge.target !== "string") {
      throw new Error("Invalid workflow manifest: malformed edge");
    }
    if (!ids.has(edge.source) || !ids.has(edge.target)) {
      throw new Error(
        `Invalid workflow manifest: edge ${edge.source}->${edge.target} references an unknown node`,
      );
    }
  }
}
