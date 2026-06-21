"use client";

import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

/** A `*.sui` agent name → its dashboard slug (`/agent/<slug>`). */
function agentSlug(name: string): string {
  return String(name || "").trim().replace(/\.sui$/i, "");
}

/** MIST (1 SUI = 1e9) → a compact SUI string: 120000000 → "0.12", 0 → "0". */
function formatSui(mist: string): string {
  const n = Number(mist);
  if (!Number.isFinite(n) || n === 0) return "0";
  return String(parseFloat((n / 1e9).toFixed(4)));
}

// ===== Shapes mirroring the registry DelegationRecord (kept local so this
// client component never imports the Node-only SDK entry). =====

interface DelegationRecord {
  childAgent: string;
  childName: string;
  allowedSkills: string[];
  allowedCapabilities: string[];
  spendLimit: string;
  spent: string;
  expiryMs: string;
  revoked: boolean;
  capId?: string;
  createdAt: string;
}

interface ParentAgent {
  slug: string;
  suinsName: string;
  network: "mainnet" | "testnet";
  status: "active" | "revoked";
  delegations: DelegationRecord[];
}

// ===== Node data =====

interface ParentNodeData extends Record<string, unknown> {
  kind: "parent";
  name: string;
  network: string;
  outgoing: number;
}

interface ChildNodeData extends Record<string, unknown> {
  kind: "child";
  delegation: DelegationRecord;
}

type DelegationNodeData = ParentNodeData | ChildNodeData;

// ===== Layout =====

const PARENT_X = 40;
const CHILD_X = 460;
const ROW_GAP = 168;
const PARENT_GAP = 220;

function shorten(value: string): string {
  if (!value) return "—";
  if (value.length <= 14) return value;
  return `${value.slice(0, 6)}…${value.slice(-5)}`;
}

function formatExpiry(expiryMs: string): { text: string; expired: boolean } {
  const ms = Number(expiryMs);
  if (!Number.isFinite(ms) || ms <= 0) return { text: "No expiry", expired: false };
  const now = Date.now();
  const expired = ms < now;
  const date = new Date(ms);
  const text = date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
  return { text: expired ? `Expired ${text}` : `Expires ${text}`, expired };
}

function buildGraph(agents: ParentAgent[]): { nodes: Node<DelegationNodeData>[]; edges: Edge[] } {
  const nodes: Node<DelegationNodeData>[] = [];
  const edges: Edge[] = [];

  // Only parents that actually granted delegations participate in the graph.
  const parents = agents.filter((a) => a.delegations.length > 0);

  let cursorY = 40;
  for (const parent of parents) {
    const childCount = parent.delegations.length;
    const blockHeight = Math.max(1, childCount) * ROW_GAP;
    const parentY = cursorY + (blockHeight - ROW_GAP) / 2;

    const parentNodeId = `parent:${parent.slug}`;
    nodes.push({
      id: parentNodeId,
      type: "delegationNode",
      position: { x: PARENT_X, y: parentY },
      data: {
        kind: "parent",
        name: parent.suinsName,
        network: parent.network,
        outgoing: childCount,
      },
      draggable: true,
    });

    parent.delegations.forEach((delegation, idx) => {
      const childNodeId = `child:${parent.slug}:${idx}`;
      nodes.push({
        id: childNodeId,
        type: "delegationNode",
        position: { x: CHILD_X, y: cursorY + idx * ROW_GAP },
        data: { kind: "child", delegation },
        draggable: true,
      });
      edges.push({
        id: `edge:${parentNodeId}->${childNodeId}`,
        source: parentNodeId,
        target: childNodeId,
        animated: !delegation.revoked,
        style: {
          stroke: delegation.revoked ? "#ba1a1a" : "#000000",
          strokeWidth: 2,
          strokeDasharray: delegation.revoked ? "6 4" : undefined,
        },
        label: delegation.revoked ? "revoked" : "delegated",
        labelStyle: {
          fontFamily: "var(--font-jetbrains-mono), monospace",
          fontSize: 10,
          fontWeight: 700,
          fill: delegation.revoked ? "#ba1a1a" : "#000000",
        },
        labelBgStyle: { fill: "#FAF8F5" },
      });
    });

    cursorY += blockHeight + PARENT_GAP;
  }

  return { nodes, edges };
}

// ===== Custom node =====

function DelegationNode({ data }: NodeProps) {
  const d = data as DelegationNodeData;

  if (d.kind === "parent") {
    return (
      <div className="w-[300px] border-2 border-pure-black bg-electric-purple/10 px-4 py-3 shadow-neo">
        <Handle type="source" position={Position.Right} className="!h-2.5 !w-2.5 !border-2 !border-pure-black !bg-electric-purple" />
        <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-electric-purple">
          Parent agent
        </p>
        <Link
          href={`/agent/${agentSlug(d.name)}`}
          className="nodrag mt-1 block truncate font-mono text-sm font-bold text-pure-black underline-offset-2 hover:text-electric-purple hover:underline"
          title={`Manage ${d.name} →`}
        >
          {d.name}
        </Link>
        <div className="mt-2 flex items-center gap-2">
          <span className="border border-pure-black bg-white px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-pure-black">
            {d.network}
          </span>
          <span className="font-mono text-[10px] font-bold text-black/60">
            {d.outgoing} grant{d.outgoing === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    );
  }

  const { delegation } = d;
  const expiry = formatExpiry(delegation.expiryMs);
  const skills = delegation.allowedSkills ?? [];
  const caps = delegation.allowedCapabilities ?? [];
  const limit = delegation.spendLimit;
  const spent = delegation.spent;
  const limitNum = Number(limit) || 0;
  const spentNum = Number(spent) || 0;
  const spentPct = limitNum > 0 ? Math.min(100, (spentNum / limitNum) * 100) : 0;

  return (
    <div
      className={`w-[340px] border-2 border-pure-black bg-white px-4 py-3 shadow-neo ${
        delegation.revoked ? "opacity-60" : ""
      }`}
    >
      <Handle type="target" position={Position.Left} className="!h-2.5 !w-2.5 !border-2 !border-pure-black !bg-pure-black" />
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-wide text-black/50">
            Sub-agent
          </p>
          {delegation.childName ? (
            <Link
              href={`/agent/${agentSlug(delegation.childName)}`}
              className="nodrag block truncate font-mono text-sm font-bold text-pure-black underline-offset-2 hover:text-electric-purple hover:underline"
              title={`Manage ${delegation.childName} →`}
            >
              {delegation.childName}
            </Link>
          ) : (
            <p className="truncate font-mono text-sm font-bold text-pure-black" title={delegation.childAgent}>
              {shorten(delegation.childAgent)}
            </p>
          )}
        </div>
        <span
          className={`shrink-0 border-2 border-pure-black px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
            delegation.revoked ? "bg-error text-white" : "bg-electric-purple text-white"
          }`}
        >
          {delegation.revoked ? "Revoked" : "Active"}
        </span>
      </div>

      {/* Allowed skills / capabilities */}
      <div className="mt-2 space-y-1.5">
        <Capabilities label="Skills" items={skills} />
        <Capabilities label="Caps" items={caps} />
      </div>

      {/* Spend */}
      <div className="mt-2">
        <div className="flex items-center justify-between font-mono text-[10px] font-bold text-black/70">
          <span>SPEND</span>
          <span>
            {formatSui(spent)} / {limit ? formatSui(limit) : "∞"} SUI
          </span>
        </div>
        <div className="mt-1 h-2 w-full border border-pure-black bg-off-white">
          <div
            className={`h-full ${spentPct >= 90 ? "bg-error" : "bg-electric-purple"}`}
            style={{ width: `${spentPct}%` }}
          />
        </div>
      </div>

      {/* Expiry + cap id */}
      <div className="mt-2 flex items-center justify-between font-mono text-[10px] font-bold">
        <span className={expiry.expired ? "text-error" : "text-black/60"}>
          {expiry.text}
        </span>
        {delegation.capId ? (
          <span className="text-black/40" title={delegation.capId}>
            cap {shorten(delegation.capId)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

function Capabilities({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex items-start gap-1.5">
      <span className="mt-0.5 shrink-0 font-mono text-[9px] font-bold uppercase text-black/40">
        {label}
      </span>
      <div className="flex flex-wrap gap-1">
        {items.length === 0 ? (
          <span className="font-mono text-[10px] text-black/40">none</span>
        ) : (
          items.slice(0, 6).map((item) => (
            <span
              key={item}
              className="border border-pure-black bg-off-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-pure-black"
            >
              {item}
            </span>
          ))
        )}
        {items.length > 6 ? (
          <span className="font-mono text-[9px] font-bold text-black/40">
            +{items.length - 6}
          </span>
        ) : null}
      </div>
    </div>
  );
}

const NODE_TYPES: NodeTypes = { delegationNode: DelegationNode };

// ===== Page =====

export default function DelegationsPage() {
  const [agents, setAgents] = useState<ParentAgent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/delegations?all=1", { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const json = (await res.json()) as { agents?: ParentAgent[] };
        if (!cancelled) setAgents(json.agents ?? []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load delegations");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const { nodes, edges } = useMemo(
    () => buildGraph(agents ?? []),
    [agents],
  );

  const totals = useMemo(() => {
    const list = agents ?? [];
    let grants = 0;
    let active = 0;
    let revoked = 0;
    for (const a of list) {
      for (const d of a.delegations) {
        grants += 1;
        if (d.revoked) revoked += 1;
        else active += 1;
      }
    }
    const parents = list.filter((a) => a.delegations.length > 0).length;
    return { grants, active, revoked, parents };
  }, [agents]);

  const hasGraph = nodes.length > 0;

  return (
    <main className="flex min-h-screen flex-col">
      <header className="border-b-2 border-pure-black bg-off-white px-6 py-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-2xl font-bold text-pure-black">
              Delegations
            </h1>
            <p className="mt-1 font-mono text-xs text-black/60">
              Parent agents granting scoped, revocable sub-agent capabilities — click an
              agent name to manage it. Source:{" "}
              <code className="text-black/80">/api/delegations</code>
            </p>
          </div>
          {agents ? (
            <div className="flex items-center gap-2">
              <Stat label="Parents" value={totals.parents} />
              <Stat label="Grants" value={totals.grants} />
              <Stat label="Active" value={totals.active} accent="purple" />
              <Stat label="Revoked" value={totals.revoked} accent="error" />
            </div>
          ) : null}
        </div>
      </header>

      <section className="relative flex-1">
        {error ? (
          <EmptyState
            title="Couldn't load delegations"
            body={error}
          />
        ) : agents === null ? (
          <EmptyState title="Loading delegations…" body="Reading the agent registry." />
        ) : !hasGraph ? (
          <EmptyState
            title="No delegations yet"
            body="When an agent grants a DelegationCap to a sub-agent (via the delegate workflow node or the delegate page), the parent → child relationship and its spend/skill scope will appear here as a graph."
          />
        ) : (
          <div className="h-[calc(100vh-89px)] w-full">
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={NODE_TYPES}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.25}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              nodesConnectable={false}
              edgesFocusable={false}
            >
              <Background color="#00000018" gap={20} />
              <Controls
                showInteractive={false}
                className="!border-2 !border-pure-black !shadow-neo [&_button]:!border-pure-black"
              />
            </ReactFlow>
          </div>
        )}
      </section>
    </main>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: "purple" | "error";
}) {
  const valueColor =
    accent === "purple"
      ? "text-electric-purple"
      : accent === "error"
        ? "text-error"
        : "text-pure-black";
  return (
    <div className="border-2 border-pure-black bg-white px-3 py-1.5 shadow-neo-purple">
      <p className="font-mono text-[9px] font-bold uppercase text-black/50">
        {label}
      </p>
      <p className={`font-mono text-lg font-bold leading-none ${valueColor}`}>
        {value}
      </p>
    </div>
  );
}

function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-[60vh] items-center justify-center px-6">
      <div className="max-w-md border-2 border-pure-black bg-white px-6 py-8 text-center shadow-neo">
        <p className="font-display text-lg font-bold text-pure-black">{title}</p>
        <p className="mt-2 font-mono text-xs leading-relaxed text-black/60">
          {body}
        </p>
      </div>
    </div>
  );
}
