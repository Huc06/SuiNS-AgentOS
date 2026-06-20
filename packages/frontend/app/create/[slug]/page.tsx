"use client";

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  useReactFlow,
  type Connection,
  type Node,
  type Edge,
  type NodeTypes,
  Handle,
  Position,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useState } from "react";

// ===== Custom Skill Node =====

function SkillNode({
  id,
  data,
}: {
  id: string;
  data: { label: string; subtitle?: string };
}) {
  const { setNodes, setEdges } = useReactFlow();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => nds.filter((n) => n.id !== id));
    setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id));
  };

  const handleDuplicate = (e: React.MouseEvent) => {
    e.stopPropagation();
    setNodes((nds) => {
      const original = nds.find((n) => n.id === id);
      if (!original) return nds;
      return [
        ...nds,
        {
          ...original,
          id: `${id}-copy-${Date.now()}`,
          position: {
            x: original.position.x + 40,
            y: original.position.y + 40,
          },
        },
      ];
    });
  };
  return (
    <div className="group relative flex flex-col items-center">
      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-2 !border-electric-purple !bg-white"
      />

      {/* Action toolbar — shows on hover */}
      <div className="absolute -top-10 left-1/2 flex -translate-x-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={handleDuplicate}
          className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-pure-black bg-white text-xs text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
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
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-7 w-7 items-center justify-center rounded-lg border-2 border-pure-black bg-white text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
          title="Delete"
        >
          ×
        </button>
      </div>

      {/* Node box */}
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-pure-black bg-white shadow-neo transition-all ${
          data.label === "Walrus" || data.label === "Memory"
            ? "text-electric-purple group-hover:border-electric-purple group-hover:shadow-[4px_4px_0_0_#6800FF]"
            : data.label === "Harbor"
              ? "text-vibrant-blue group-hover:border-vibrant-blue group-hover:shadow-[4px_4px_0_0_#0098F5]"
              : data.label === "Sui"
                ? "text-vibrant-blue group-hover:border-vibrant-blue group-hover:shadow-[4px_4px_0_0_#0098F5]"
                : "text-electric-purple group-hover:border-electric-purple group-hover:shadow-[4px_4px_0_0_#6800FF]"
        }`}
      >
        {data.label === "Walrus" || data.label === "Memory" ? (
          <img
            src="/images/logos/walrus-memory.svg"
            alt="Walrus Memory"
            className="h-7 w-auto object-contain"
          />
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
        ) : (
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="8,5 19,12 8,19" />
          </svg>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-2 !border-on-surface-variant !bg-surface-container"
      />

      {/* Labels */}
      <p className="mt-3 text-center font-mono text-xs font-bold text-on-surface">
        {data.label}
      </p>
      {data.subtitle && (
        <p className="text-center font-mono text-[10px] text-on-surface-variant">
          {data.subtitle}
        </p>
      )}
    </div>
  );
}

const nodeTypes: NodeTypes = {
  skill: SkillNode,
};

// ===== Initial demo flow =====

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
    data: { label: "Walrus", subtitle: "Store manifest" },
  },
  {
    id: "harbor-seal",
    type: "skill",
    position: { x: 560, y: 150 },
    data: { label: "Harbor", subtitle: "Seal encrypt" },
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
    data: { label: "Memory", subtitle: "Walrus storage" },
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
    label: "ENCRYPT",
    labelStyle: { fill: "#494457", fontSize: 9, fontFamily: "monospace" },
    style: { stroke: "#6800FF", strokeDasharray: "5 5" },
  },
  {
    id: "e3",
    source: "walrus-store",
    target: "sui-exec",
    type: "smoothstep",
    label: "ON-CHAIN",
    labelStyle: { fill: "#494457", fontSize: 9, fontFamily: "monospace" },
    style: { stroke: "#0098F5", strokeDasharray: "5 5" },
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
    style: { stroke: "#0098F5", strokeDasharray: "5 5" },
  },
];

export default function WorkflowEditorPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [showMetrics, setShowMetrics] = useState(false);

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

  return (
    <div className="relative h-[calc(100vh-0px)] w-full overflow-hidden bg-off-white">
      {/* Top nav */}
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center border-b border-pure-black/10 bg-off-white/95 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/create"
            className="font-mono text-sm text-on-surface-variant hover:text-on-surface"
          >
            {"← Workflows"}
          </Link>
          <span className="text-on-surface-variant/40">{"/"}</span>
          <span className="font-display text-lg font-bold text-on-surface">
            {"@"}
            {slug}
          </span>
        </div>
        <div className="flex-1 text-center">
          <span className="font-mono text-sm text-on-surface-variant">
            {"▶ Runs"}
          </span>
        </div>
      </div>

      {/* Canvas */}
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
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
        <Controls className="[&_button]:!border [&_button]:!border-pure-black/20 [&_button]:!bg-white [&_button]:!text-on-surface" />
        <MiniMap
          className="!border !border-pure-black/20 !bg-white"
          nodeColor="#6800FF"
          maskColor="rgba(250,248,245,0.7)"
        />
      </ReactFlow>

      {/* Bottom metrics toggle */}
      <div className="absolute bottom-0 left-0 right-0 z-20">
        {/* Toggle button — pill */}
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => setShowMetrics(!showMetrics)}
            className="relative -top-3 flex h-6 w-16 items-center justify-center rounded-full bg-electric-purple text-white shadow-lg ring-2 ring-off-white transition-colors hover:bg-electric-purple/90"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform ${showMetrics ? "rotate-180" : ""}`}
            >
              <path d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>

        {/* Metrics panel — ~half screen */}
        {showMetrics && (
          <div className="h-[45vh] overflow-y-auto border-t-2 border-pure-black bg-off-white px-6 py-4">
            <div className="grid h-full grid-cols-3 gap-4">
              {/* Network stats + TX/SEC */}
              <div className="flex flex-col gap-4">
                <div className="border border-pure-black/20 bg-white p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-mono text-xs font-bold text-white">
                      NETWORK (LIVE)
                    </h4>
                    <span className="flex items-center gap-1 font-mono text-[10px] text-green-700">
                      ● LIVE
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="font-mono text-[10px] text-on-surface-variant">
                        NETWORK TPS
                      </p>
                      <p className="font-mono text-lg font-bold text-white">
                        0
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-on-surface-variant">
                        TOTAL ACTIONS
                      </p>
                      <p className="font-mono text-lg font-bold text-white">
                        3,771,710
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-on-surface-variant">
                        ACTIVE TUNNELS
                      </p>
                      <p className="font-mono text-lg font-bold text-white">
                        289
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-on-surface-variant">
                        SETTLED TUNNELS
                      </p>
                      <p className="font-mono text-lg font-bold text-white">
                        1,804
                      </p>
                    </div>
                  </div>
                </div>
                <div className="border border-pure-black/20 bg-white p-4">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-mono text-xs font-bold text-white">
                      TRANSACTIONS / SEC
                    </h4>
                    <span className="flex items-center gap-1 font-mono text-[10px] text-green-700">
                      ● LIVE
                    </span>
                  </div>
                  <p className="font-mono text-sm text-on-surface-variant">
                    <span className="text-lg font-bold text-white">0</span>{" "}
                    tx/sec · live
                  </p>
                </div>
              </div>

              {/* Live transactions with table header */}
              <div className="border border-pure-black/20 bg-white p-4">
                <h4 className="mb-2 font-mono text-xs font-bold text-white">
                  LIVE TRANSACTIONS
                </h4>
                <div className="mb-3 flex gap-2">
                  <span className="border border-electric-purple bg-electric-purple/20 px-2 py-0.5 font-mono text-[10px] font-bold text-electric-purple">
                    All
                  </span>
                  <span className="cursor-pointer border border-gray-700 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-white">
                    Walrus
                  </span>
                  <span className="cursor-pointer border border-gray-700 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-white">
                    Harbor
                  </span>
                  <span className="cursor-pointer border border-gray-700 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-white">
                    Sui PTB
                  </span>
                  <span className="cursor-pointer border border-gray-700 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-white">
                    Delegate
                  </span>
                </div>
                {/* Table header */}
                <div className="mb-1 flex items-center justify-between border-b border-pure-black/20 pb-1 font-mono text-[9px] font-bold uppercase text-on-surface-variant">
                  <span className="w-20">Digest</span>
                  <span className="w-16">Address</span>
                  <span className="w-14">Time</span>
                  <span className="w-12">Type</span>
                  <span className="w-12">Status</span>
                  <span className="w-16 text-right">Amount</span>
                </div>
                {/* Rows */}
                <div className="space-y-1.5">
                  {[
                    {
                      digest: "5avtT8...ef6K",
                      addr: "—",
                      time: "22:52:22",
                      type: "Store",
                      status: "Opened",
                      amount: "—",
                    },
                    {
                      digest: "yXLUjx...mm9V",
                      addr: "—",
                      time: "22:31:58",
                      type: "Exec",
                      status: "Settled",
                      amount: "0.01 SUI",
                    },
                    {
                      digest: "BRnV7p...ZzKH",
                      addr: "—",
                      time: "22:31:58",
                      type: "Store",
                      status: "Opened",
                      amount: "—",
                    },
                    {
                      digest: "9osc3z...He9B",
                      addr: "—",
                      time: "22:31:57",
                      type: "Seal",
                      status: "Opened",
                      amount: "—",
                    },
                    {
                      digest: "4hX1eN...1qkC",
                      addr: "—",
                      time: "22:31:35",
                      type: "Exec",
                      status: "Settled",
                      amount: "0.01 SUI",
                    },
                  ].map((tx) => (
                    <div
                      key={tx.digest}
                      className="flex items-center justify-between font-mono text-[10px]"
                    >
                      <span className="w-20 text-on-surface-variant">{tx.digest}</span>
                      <span className="w-16 text-on-surface-variant">{tx.addr}</span>
                      <span className="w-14 text-on-surface-variant">{tx.time}</span>
                      <span className="w-12 text-on-surface-variant">{tx.type}</span>
                      <span
                        className={`w-12 ${tx.status === "Settled" ? "text-green-700" : "text-electric-purple"}`}
                      >
                        {tx.status}
                      </span>
                      <span
                        className={`w-16 text-right ${tx.amount !== "—" ? "text-green-700" : "text-on-surface-variant"}`}
                      >
                        {tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* My activity with table header */}
              <div className="border border-pure-black/20 bg-white p-4">
                <h4 className="mb-2 font-mono text-xs font-bold text-white">
                  MY ACTIVITY
                </h4>
                <div className="mb-3 flex gap-2">
                  <span className="border border-electric-purple bg-electric-purple/20 px-2 py-0.5 font-mono text-[10px] font-bold text-electric-purple">
                    All
                  </span>
                  <span className="cursor-pointer border border-gray-700 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-white">
                    Walrus
                  </span>
                  <span className="cursor-pointer border border-gray-700 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-white">
                    Harbor
                  </span>
                  <span className="cursor-pointer border border-gray-700 px-2 py-0.5 font-mono text-[10px] text-on-surface-variant hover:text-white">
                    Sui PTB
                  </span>
                </div>
                {/* Table header */}
                <div className="mb-1 flex items-center justify-between border-b border-pure-black/20 pb-1 font-mono text-[9px] font-bold uppercase text-on-surface-variant">
                  <span className="w-14">Time</span>
                  <span className="w-12">Type</span>
                  <span className="w-12">Status</span>
                  <span className="w-16 text-right">Amount</span>
                </div>
                <p className="mt-4 text-center font-mono text-xs italic text-on-surface-variant">
                  No activity yet.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons removed */}
      </div>

      {/* + button */}
      <div className="absolute right-6 top-16 z-10">
        <button
          type="button"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-pure-black bg-white text-xl text-on-surface transition-all hover:border-electric-purple hover:text-electric-purple"
        >
          +
        </button>
      </div>

      {/* Tools Panel — right side */}
      {showAddMenu && (
        <div className="absolute right-0 top-0 z-20 flex h-full w-72 flex-col border-l-2 border-pure-black bg-off-white shadow-2xl">
          <div className="flex items-center justify-between border-b-2 border-pure-black px-4 py-3">
            <h3 className="font-mono text-sm font-bold text-on-surface">
              TOOLS
            </h3>
            <button
              type="button"
              onClick={() => setShowAddMenu(false)}
              className="text-on-surface-variant hover:text-on-surface"
            >
              ✕
            </button>
          </div>
          <div className="border-b border-pure-black/10 px-4 py-3">
            <input
              type="search"
              placeholder="Search by tags, category..."
              className="w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-xs outline-none placeholder:text-on-surface-variant focus:border-electric-purple"
            />
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="border-b border-pure-black/10 px-4 py-2">
              <p className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
                In This Workflow ({nodes.length})
              </p>
            </div>
            <div className="border-b-2 border-electric-purple bg-electric-purple/10 px-4 py-2">
              <p className="font-mono text-[10px] font-bold uppercase text-electric-purple">
                All Tools
              </p>
            </div>
            <div className="space-y-1 p-2">
              {[
                {
                  category: "storage",
                  tools: [
                    { label: "Walrus", subtitle: "Store manifest" },
                    { label: "Memory", subtitle: "Walrus storage" },
                  ],
                  color: "text-purple-400",
                  count: 2,
                },
                {
                  category: "security",
                  tools: [{ label: "Harbor", subtitle: "Seal encrypt" }],
                  color: "text-electric-purple",
                  count: 1,
                },
                {
                  category: "blockchain",
                  tools: [
                    { label: "Sui", subtitle: "Execute PTB" },
                    { label: "Delegate", subtitle: "Sub-agent" },
                  ],
                  color: "text-cyan-400",
                  count: 2,
                },
                {
                  category: "triggers",
                  tools: [{ label: "Trigger", subtitle: "Manual start" }],
                  color: "text-orange-400",
                  count: 1,
                },
              ].map((cat) => (
                <details
                  key={cat.category}
                  className="border-2 border-pure-black/20 bg-white"
                >
                  <summary className="flex cursor-pointer items-center justify-between px-3 py-3 font-mono text-sm font-bold text-on-surface hover:bg-surface-container">
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
                          const id = `${tool.label.toLowerCase()}-${Date.now()}`;
                          setNodes((nds) => [
                            ...nds,
                            {
                              id,
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
                        <span
                          className={`font-mono text-lg font-bold ${cat.color}`}
                        >
                          {tool.label.charAt(0)}
                        </span>
                        <div>
                          <p className="font-mono text-xs font-bold text-on-surface">
                            {tool.label}
                          </p>
                          <p className="font-mono text-[10px] text-on-surface-variant">
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
  );
}
