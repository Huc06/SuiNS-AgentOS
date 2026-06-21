/**
 * Per-agent DEFAULT workflow graphs for the canvas.
 *
 * When `/create/[slug]` first loads, the canvas shows a default graph. Instead
 * of the SAME generic graph for every agent, this module maps each known demo
 * agent's slug to a DISTINCT, on-brand starter workflow that matches its
 * name/use-case. Unknown slugs fall back to the editor's existing generic graph
 * (see `GENERIC_DEFAULT` / the page's `initialNodes`).
 *
 * Each builder produces the SAME `{ nodes, edges }` shape the canvas already
 * understands (node `label` drives `LABEL_TO_TYPE`; `params` flow straight into
 * the run POST body — see `lib/node-config.ts` and the editor page). Every node
 * carries sensible default `params` so the graph runs out of the box and
 * settles on a clean done/skipped run (no hard errors), while staying
 * re-pointable via each node's inline config. The Templates dropdown and the
 * Demo Graph button still OVERRIDE whatever loads here.
 *
 * Only the existing node types are used: trigger, walrus, harbor, sui, memory,
 * memory-recall, import-agent, delegate, call-sub-agent, attest.
 *
 * Browser-safe: no Node-only imports. React Flow `Node` / `Edge` are types only.
 */

import type { Node, Edge } from "@xyflow/react";

/**
 * The node `data` shape the canvas reads (label drives `LABEL_TO_TYPE`; params
 * flow into the run POST). Kept structural so we don't import the editor page's
 * private `SkillNodeData`.
 */
type AgentNodeData = {
  label: string;
  subtitle: string;
  params?: Record<string, string>;
};

export type AgentGraph = { nodes: Node[]; edges: Edge[] };

export type AgentWorkflow = {
  /** Human name for the default graph (used in docs / future UI labels). */
  name: string;
  /** One-line description of what this agent's default flow shows off. */
  description: string;
  /** Build the concrete graph, seeded with the agent's `.sui` name. */
  build: (slug: string) => AgentGraph;
};

// ===== styling helpers (mirror the canvas' neo-brutalist edge styling) =====

const PURPLE = "#6800FF";
const ORANGE = "#f97316";
const PINK = "#ec4899";

/** Build a dashed smoothstep edge, optionally labelled (monospace, like demo). */
function mkEdge(
  id: string,
  source: string,
  target: string,
  color: string,
  label?: string,
): Edge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    style: { stroke: color, strokeDasharray: "5 5" },
    ...(label
      ? {
          label,
          labelStyle: { fill: "#000", fontSize: 9, fontFamily: "monospace" },
        }
      : {}),
  };
}

/** Build a canvas node with the `skill` renderer + structural data. */
function mkNode(id: string, x: number, y: number, data: AgentNodeData): Node {
  return { id, type: "skill", position: { x, y }, data };
}

/** Resolve a bare slug or `.sui` name to a usable `.sui` default target. */
export function selfName(slug: string): string {
  const n = slug?.trim().replace(/^@/, "");
  if (!n) return "alice.sui";
  return n.includes(".") ? n : `${n}.sui`;
}

// A small, illustrative default payload for storage nodes. Stored verbatim by
// the Walrus executor (`params.manifest`).
function snapshotParam(self: string, kind: string): string {
  return JSON.stringify({
    agent: self,
    kind,
    createdAt: "1970-01-01T00:00:00.000Z",
    note: `Sample ${kind} payload stored by ${self}'s default workflow.`,
  });
}

// ===== per-agent default workflows =====

export const AGENT_WORKFLOWS: Record<string, AgentWorkflow> = {
  // @alpha — general orchestrator (has skills): the coordinate loop.
  // Trigger -> Import Agent -> Delegate -> Call Sub-Agent -> Attest.
  alpha: {
    name: "Orchestrator coordinate loop",
    description:
      "Import a peer's skill catalog, grant it a delegation, call it, then attest.",
    build: (slug) => {
      const self = selfName(slug);
      const nodes: Node[] = [
        mkNode("alpha-trigger", 40, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("alpha-import", 240, 240, {
          label: "Import Agent",
          subtitle: "Read skill catalog",
          params: { agent: self },
        }),
        mkNode("alpha-delegate", 460, 240, {
          label: "Delegate",
          subtitle: "Grant cap",
          params: { child: self, spendLimit: "0", expiryMs: "0" },
        }),
        mkNode("alpha-call", 680, 240, {
          label: "Call Sub-Agent",
          subtitle: "Delegated exec",
          params: { skill: self, cost: "0" },
        }),
        mkNode("alpha-attest", 900, 240, {
          label: "Attest",
          subtitle: "Reputation",
          params: { kind: "review", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("ae1", "alpha-trigger", "alpha-import", PINK),
        mkEdge("ae2", "alpha-import", "alpha-delegate", PINK, "GRANT"),
        mkEdge("ae3", "alpha-delegate", "alpha-call", PINK, "DELEGATED"),
        mkEdge("ae4", "alpha-call", "alpha-attest", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },

  // @beta-agent — sandbox / testing harness.
  // Trigger -> Sui (Execute PTB, a sandbox record_execution) -> Memory (Remember the run).
  "beta-agent": {
    name: "Sandbox test run",
    description:
      "Execute a sandbox record_execution PTB, then remember the test run.",
    build: (slug) => {
      const self = selfName(slug);
      const nodes: Node[] = [
        mkNode("beta-trigger", 80, 240, {
          label: "Trigger",
          subtitle: "Run test",
        }),
        mkNode("beta-exec", 320, 240, {
          label: "Sui",
          // record_execution path: leave movePackage/entry blank so it runs the
          // passport record_execution (or skips cleanly with no package id).
          subtitle: "Sandbox exec",
        }),
        mkNode("beta-memory", 560, 240, {
          label: "Memory",
          subtitle: "Remember run",
          params: {
            namespace: self,
            text: "sandbox test run executed",
          },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("be1", "beta-trigger", "beta-exec", ORANGE, "EXEC"),
        mkEdge("be2", "beta-exec", "beta-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },

  // @walrus-bot — storage specialist.
  // Trigger -> Walrus (Store blob) -> Memory (Remember) -> Memory Recall (read it back).
  "walrus-bot": {
    name: "Store, remember, recall",
    description:
      "Store a blob on Walrus, remember it, then recall it from memory.",
    build: (slug) => {
      const self = selfName(slug);
      const nodes: Node[] = [
        mkNode("walrus-trigger", 40, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("walrus-store", 260, 240, {
          label: "Walrus",
          subtitle: "Store blob",
          params: { manifest: snapshotParam(self, "blob") },
        }),
        mkNode("walrus-memory", 480, 240, {
          label: "Memory",
          subtitle: "Remember blob",
          params: {
            namespace: self,
            text: "stored a blob on Walrus",
          },
        }),
        mkNode("walrus-recall", 720, 240, {
          label: "Memory Recall",
          subtitle: "Read it back",
          params: { namespace: self, query: "what did I store?", limit: "5" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("we1", "walrus-trigger", "walrus-store", PURPLE, "STORE"),
        mkEdge("we2", "walrus-store", "walrus-memory", PURPLE, "REMEMBER"),
        mkEdge("we3", "walrus-memory", "walrus-recall", PURPLE, "RECALL"),
      ];
      return { nodes, edges };
    },
  },

  // @defi-rebalancer — DeFi automation.
  // Trigger -> Memory Recall (recall positions) -> Sui (Execute PTB = rebalance) -> Attest (record result).
  "defi-rebalancer": {
    name: "Rebalance positions",
    description:
      "Recall current positions, execute a rebalance PTB, then attest the result.",
    build: (slug) => {
      const self = selfName(slug);
      const nodes: Node[] = [
        mkNode("defi-trigger", 40, 240, {
          label: "Trigger",
          subtitle: "Rebalance tick",
        }),
        mkNode("defi-recall", 260, 240, {
          label: "Memory Recall",
          subtitle: "Recall positions",
          params: {
            namespace: self,
            query: "current portfolio positions",
            limit: "5",
          },
        }),
        mkNode("defi-exec", 500, 240, {
          label: "Sui",
          // record_execution path = the on-chain rebalance step.
          subtitle: "Execute rebalance",
        }),
        mkNode("defi-attest", 740, 240, {
          label: "Attest",
          subtitle: "Record result",
          params: { kind: "completion", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("de1", "defi-trigger", "defi-recall", PURPLE, "RECALL"),
        mkEdge("de2", "defi-recall", "defi-exec", ORANGE, "REBALANCE"),
        mkEdge("de3", "defi-exec", "defi-attest", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },

  // @sui-indexer — on-chain reader / indexer.
  // Trigger -> Sui (Execute PTB / read) -> Walrus (Store blob = index snapshot) -> Memory (Remember).
  "sui-indexer": {
    name: "Index snapshot",
    description:
      "Read on-chain state, store an index snapshot on Walrus, then remember it.",
    build: (slug) => {
      const self = selfName(slug);
      const nodes: Node[] = [
        mkNode("indexer-trigger", 40, 240, {
          label: "Trigger",
          subtitle: "Index tick",
        }),
        mkNode("indexer-read", 260, 240, {
          label: "Sui",
          // record_execution path = the on-chain read step.
          subtitle: "Read on-chain",
        }),
        mkNode("indexer-store", 500, 240, {
          label: "Walrus",
          subtitle: "Store snapshot",
          params: { manifest: snapshotParam(self, "index-snapshot") },
        }),
        mkNode("indexer-memory", 740, 240, {
          label: "Memory",
          subtitle: "Remember snapshot",
          params: {
            namespace: self,
            text: "indexed on-chain state into a snapshot",
          },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("ie1", "indexer-trigger", "indexer-read", ORANGE, "READ"),
        mkEdge("ie2", "indexer-read", "indexer-store", PURPLE, "SNAPSHOT"),
        mkEdge("ie3", "indexer-store", "indexer-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },
};

/**
 * Look up the default workflow graph for an agent slug. Returns the agent's
 * themed graph when known, otherwise `undefined` so the caller falls back to the
 * editor's generic default. Slug matching is tolerant of a leading `@` and a
 * trailing `.sui` (the URL slug is the bare name, but be defensive).
 */
export function defaultGraphForSlug(slug: string): AgentGraph | undefined {
  const key = (slug ?? "").trim().replace(/^@/, "").replace(/\.sui$/, "");
  const wf = AGENT_WORKFLOWS[key];
  return wf ? wf.build(key) : undefined;
}
