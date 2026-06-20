/**
 * Workflow run engine: topo-sort a {@link WorkflowGraph} and execute it
 * sequentially, stopping the chain on the first error.
 */

import { classifyError, diagnoseStep } from "./diagnose.js";
import { executors as defaultExecutors, type StepExecutor } from "./executors.js";
import type {
  RunContext,
  StepResult,
  WorkflowGraph,
  WorkflowNode,
} from "./types.js";

/**
 * Attach the structured diagnosis (code/hint/cause/remediation) to a settled
 * step. Only errored/skipped/pending steps carry it; `done` steps stay lean.
 */
function withDiagnosis(step: StepResult): StepResult {
  if (
    step.status !== "error" &&
    step.status !== "skipped" &&
    step.status !== "pending"
  ) {
    return step;
  }
  const d = diagnoseStep(step);
  return {
    ...step,
    errorCode: d.code,
    ...(step.status === "error"
      ? { errorHint: classifyError(step.error).hint }
      : {}),
    cause: d.cause,
    ...(d.remediation ? { remediation: d.remediation } : {}),
  };
}

export interface RunWorkflowOptions {
  /** Called before a node runs (status `running`) and after it settles. */
  onStep?: (step: StepResult) => void;
  /** Override the executor table (used by tests). */
  executors?: Partial<Record<WorkflowNode["type"], StepExecutor>>;
}

export interface RunWorkflowResult {
  steps: StepResult[];
  status: "done" | "error";
}

/**
 * Kahn topological sort. Nodes with no incoming edge come first; original node
 * order is preserved among independent nodes. Any nodes left over (e.g. in a
 * cycle) are appended in their original order so they still execute.
 */
function topoSort(graph: WorkflowGraph): WorkflowNode[] {
  const { nodes, edges } = graph;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const indegree = new Map<string, number>(nodes.map((n) => [n.id, 0]));
  const adj = new Map<string, string[]>();

  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    adj.set(edge.source, [...(adj.get(edge.source) ?? []), edge.target]);
    indegree.set(edge.target, (indegree.get(edge.target) ?? 0) + 1);
  }

  const ready: string[] = nodes
    .filter((n) => (indegree.get(n.id) ?? 0) === 0)
    .map((n) => n.id);
  const visited = new Set<string>();
  const order: WorkflowNode[] = [];

  while (ready.length > 0) {
    const id = ready.shift();
    if (id === undefined || visited.has(id)) continue;
    visited.add(id);
    const node = byId.get(id);
    if (node) order.push(node);
    for (const next of adj.get(id) ?? []) {
      const remaining = (indegree.get(next) ?? 0) - 1;
      indegree.set(next, remaining);
      if (remaining <= 0 && !visited.has(next)) ready.push(next);
    }
  }

  // Append unreachable nodes (cycles / dangling) in original order.
  for (const node of nodes) {
    if (!visited.has(node.id)) order.push(node);
  }

  return order;
}

/** Fold an executor result into a fully-formed StepResult. */
function settle(
  node: WorkflowNode,
  partial: {
    status: StepResult["status"];
    output?: unknown;
    txDigest?: string;
    blobId?: string;
    error?: string;
  },
): StepResult {
  return {
    nodeId: node.id,
    type: node.type,
    status: partial.status,
    ...(partial.output !== undefined ? { output: partial.output } : {}),
    ...(partial.txDigest ? { txDigest: partial.txDigest } : {}),
    ...(partial.blobId ? { blobId: partial.blobId } : {}),
    ...(partial.error ? { error: partial.error } : {}),
  };
}

/**
 * Execute a workflow graph node-by-node in topological order.
 *
 * - `onStep` fires twice per node: once with `running`, once with the result.
 * - The first `error` halts execution; every downstream node is recorded as
 *   `pending` (and still reported via `onStep`).
 */
export async function runWorkflow(
  graph: WorkflowGraph,
  ctx: RunContext,
  opts: RunWorkflowOptions = {},
): Promise<RunWorkflowResult> {
  const executors = { ...defaultExecutors, ...opts.executors };
  const ordered = topoSort(graph);
  const steps: StepResult[] = [];
  let failed = false;

  for (const node of ordered) {
    if (failed) {
      const pending = withDiagnosis({
        nodeId: node.id,
        type: node.type,
        status: "pending",
      });
      steps.push(pending);
      opts.onStep?.(pending);
      continue;
    }

    // Before: announce the node as running.
    opts.onStep?.({ nodeId: node.id, type: node.type, status: "running" });

    let result: StepResult;
    const executor = executors[node.type];
    if (!executor) {
      result = settle(node, {
        status: "error",
        error: `No executor for node type: ${node.type}`,
      });
    } else {
      try {
        result = settle(node, await executor(node, ctx, steps.slice()));
      } catch (err) {
        result = settle(node, {
          status: "error",
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    result = withDiagnosis(result);
    steps.push(result);
    // After: announce the settled result.
    opts.onStep?.(result);
    if (result.status === "error") failed = true;
  }

  return { steps, status: failed ? "error" : "done" };
}
