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
    setEdges((eds) =>
      eds.filter((edge) => edge.source !== id && edge.target !== id),
    );
  };

  const handleEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    // TODO: open edit modal
  };

  const nodeColor =
    data.label === "Walrus" || data.label === "Memory"
      ? "group-hover:border-purple-500 group-hover:shadow-[0_0_12px_rgba(168,85,247,0.3)]"
      : data.label === "Harbor"
        ? "group-hover:border-blue-500 group-hover:shadow-[0_0_12px_rgba(96,165,250,0.3)]"
        : data.label === "Sui"
          ? "group-hover:border-cyan-500 group-hover:shadow-[0_0_12px_rgba(34,211,238,0.3)]"
          : "group-hover:border-orange-500 group-hover:shadow-[0_0_12px_rgba(249,115,22,0.3)]";

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
      <div
        className={`flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-pure-black/30 bg-white text-black transition-all ${nodeColor}`}
      >
        {data.label === "Walrus" || data.label === "Memory" ? (
          <img
            src="/images/logos/walrus-memory.svg"
            alt="Walrus"
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
    </div>
  );
}

const nodeTypes: NodeTypes = { skill: SkillNode };

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

  return (
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

        {/* Center: ▶ Runs */}
        <div className="flex-1 text-center">
          <span className="font-mono text-sm font-bold text-black">▶ Runs</span>
        </div>

        {/* Right: tools toggle */}
        <button
          type="button"
          onClick={() => setShowTools(!showTools)}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-pure-black bg-white text-lg text-black transition-all hover:border-electric-purple hover:text-electric-purple"
        >
          +
        </button>
      </div>

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
              className={`transition-transform ${showMetrics ? "rotate-180" : ""}`}
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
            <div className="grid h-full grid-cols-3 gap-4">
              {/* Network stats */}
              <div className="flex flex-col gap-4">
                <div className="border-2 border-pure-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="font-mono text-xs font-bold text-black">
                      NETWORK (LIVE)
                    </h4>
                    <span className="font-mono text-[10px] font-bold text-green-700">
                      ● LIVE
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="font-mono text-[10px] text-black/50">
                        NETWORK TPS
                      </p>
                      <p className="font-mono text-lg font-bold text-black">
                        0
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-black/50">
                        TOTAL ACTIONS
                      </p>
                      <p className="font-mono text-lg font-bold text-black">
                        3,771,710
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-black/50">
                        ACTIVE TUNNELS
                      </p>
                      <p className="font-mono text-lg font-bold text-black">
                        289
                      </p>
                    </div>
                    <div>
                      <p className="font-mono text-[10px] text-black/50">
                        SETTLED TUNNELS
                      </p>
                      <p className="font-mono text-lg font-bold text-black">
                        1,804
                      </p>
                    </div>
                  </div>
                </div>
                <div className="border-2 border-pure-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
                  <div className="mb-2 flex items-center justify-between">
                    <h4 className="font-mono text-xs font-bold text-black">
                      TRANSACTIONS / SEC
                    </h4>
                    <span className="font-mono text-[10px] font-bold text-green-700">
                      ● LIVE
                    </span>
                  </div>
                  <p className="font-mono text-sm text-black/60">
                    <span className="text-lg font-bold text-black">0</span>{" "}
                    tx/sec · live
                  </p>
                </div>
              </div>

              {/* Live Transactions */}
              <div className="border-2 border-pure-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
                <h4 className="mb-2 font-mono text-xs font-bold text-black">
                  LIVE TRANSACTIONS
                </h4>
                <div className="mb-3 flex gap-2">
                  <span className="border-2 border-electric-purple bg-electric-purple/10 px-2 py-0.5 font-mono text-[10px] font-bold text-black">
                    All
                  </span>
                  <span className="cursor-pointer border-2 border-pure-black/20 px-2 py-0.5 font-mono text-[10px] text-black hover:border-electric-purple">
                    Walrus
                  </span>
                  <span className="cursor-pointer border-2 border-pure-black/20 px-2 py-0.5 font-mono text-[10px] text-black hover:border-electric-purple">
                    Harbor
                  </span>
                  <span className="cursor-pointer border-2 border-pure-black/20 px-2 py-0.5 font-mono text-[10px] text-black hover:border-electric-purple">
                    Sui PTB
                  </span>
                  <span className="cursor-pointer border-2 border-pure-black/20 px-2 py-0.5 font-mono text-[10px] text-black hover:border-electric-purple">
                    Delegate
                  </span>
                </div>
                <div className="mb-1 flex items-center justify-between border-b-2 border-pure-black/10 pb-1 font-mono text-[9px] font-bold uppercase text-black/50">
                  <span className="w-20">Digest</span>
                  <span className="w-16">Address</span>
                  <span className="w-14">Time</span>
                  <span className="w-12">Type</span>
                  <span className="w-12">Status</span>
                  <span className="w-16 text-right">Amount</span>
                </div>
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
                      <span className="w-20 text-black/60">{tx.digest}</span>
                      <span className="w-16 text-black/30">{tx.addr}</span>
                      <span className="w-14 text-black/50">{tx.time}</span>
                      <span className="w-12 text-black">{tx.type}</span>
                      <span
                        className={`w-12 font-bold ${tx.status === "Settled" ? "text-green-700" : "text-black"}`}
                      >
                        {tx.status}
                      </span>
                      <span
                        className={`w-16 text-right font-bold ${tx.amount !== "—" ? "text-green-700" : "text-black/30"}`}
                      >
                        {tx.amount}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* My Activity */}
              <div className="border-2 border-pure-black bg-white p-4 shadow-[4px_4px_0_0_#000]">
                <h4 className="mb-2 font-mono text-xs font-bold text-black">
                  MY ACTIVITY
                </h4>
                <div className="mb-3 flex gap-2">
                  <span className="border-2 border-electric-purple bg-electric-purple/10 px-2 py-0.5 font-mono text-[10px] font-bold text-black">
                    All
                  </span>
                  <span className="cursor-pointer border-2 border-pure-black/20 px-2 py-0.5 font-mono text-[10px] text-black hover:border-electric-purple">
                    Walrus
                  </span>
                  <span className="cursor-pointer border-2 border-pure-black/20 px-2 py-0.5 font-mono text-[10px] text-black hover:border-electric-purple">
                    Harbor
                  </span>
                  <span className="cursor-pointer border-2 border-pure-black/20 px-2 py-0.5 font-mono text-[10px] text-black hover:border-electric-purple">
                    Sui PTB
                  </span>
                </div>
                <div className="mb-1 flex items-center justify-between border-b-2 border-pure-black/10 pb-1 font-mono text-[9px] font-bold uppercase text-black/50">
                  <span className="w-14">Time</span>
                  <span className="w-12">Type</span>
                  <span className="w-12">Status</span>
                  <span className="w-16 text-right">Amount</span>
                </div>
                <p className="mt-4 text-center font-mono text-xs italic text-black/40">
                  No activity yet.
                </p>
              </div>
            </div>
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
                    { label: "Walrus", subtitle: "Store manifest" },
                    { label: "Memory", subtitle: "Walrus storage" },
                  ],
                  count: 2,
                },
                {
                  category: "security",
                  tools: [{ label: "Harbor", subtitle: "Seal encrypt" }],
                  count: 1,
                },
                {
                  category: "blockchain",
                  tools: [
                    { label: "Sui", subtitle: "Execute PTB" },
                    { label: "Delegate", subtitle: "Sub-agent" },
                  ],
                  count: 2,
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
                              id: `${tool.label.toLowerCase()}-${Date.now()}`,
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
  );
}
