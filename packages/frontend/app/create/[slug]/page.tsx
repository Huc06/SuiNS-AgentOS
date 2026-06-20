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
      <div className="absolute -top-12 left-1/2 flex -translate-x-1/2 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            alert(`Run node: ${data.label}`);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-pure-black bg-white text-xs text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          title="Run"
        >
          ▶
        </button>
        <button
          type="button"
          onClick={handleDuplicate}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-pure-black bg-white text-xs text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          title="Duplicate"
        >
          ✎
        </button>
        <button
          type="button"
          onClick={handleDelete}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-pure-black bg-white text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
          title="Delete"
        >
          🗑
        </button>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            alert(`Settings: ${data.label}`);
          }}
          className="flex h-8 w-8 items-center justify-center rounded-lg border-2 border-pure-black bg-white text-xs text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
          title="Settings"
        >
          ⚙
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
      <div className="absolute left-0 right-0 top-0 z-10 flex items-center justify-between border-b border-pure-black/10 bg-off-white/95 px-4 py-2 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/create"
            className="font-mono text-xs text-on-surface-variant hover:text-on-surface"
          >
            ← Workflows
          </Link>
          <span className="text-on-surface-variant/40">/</span>
          <span className="font-mono text-xs font-bold text-on-surface">
            @{slug}
          </span>
          <span className="font-mono text-[10px] text-on-surface-variant">
            ▶ Runs
          </span>
        </div>
        <span className="font-mono text-[10px] text-on-surface-variant">
          0/1,000
        </span>
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

      {/* Bottom bar */}
      <div className="absolute bottom-6 left-1/2 z-10 flex -translate-x-1/2 items-center gap-4">
        <button
          type="button"
          className="border-2 border-pure-black bg-white px-4 py-2 font-mono text-xs font-bold text-on-surface-variant hover:bg-surface-container"
        >
          Cannot Execute
        </button>
        <button
          type="button"
          className="border-2 border-pure-black bg-electric-purple px-6 py-2 font-mono text-xs font-bold text-white neo-shadow hover:bg-electric-purple/90"
        >
          Run Workflow
        </button>
      </div>

      {/* Add node FAB — dropdown menu */}
      <div className="absolute right-6 top-16 z-10 flex flex-col items-end gap-2">
        <button
          type="button"
          onClick={() => setShowAddMenu(!showAddMenu)}
          className="flex h-10 w-10 items-center justify-center rounded-xl border-2 border-pure-black bg-white text-xl text-on-surface shadow-neo transition-all hover:border-electric-purple hover:text-electric-purple"
        >
          +
        </button>

        {showAddMenu && (
          <div className="w-48 overflow-hidden rounded-xl border-2 border-pure-black bg-white shadow-neo-lg">
            <p className="border-b border-pure-black/10 px-3 py-2 font-mono text-[10px] font-bold uppercase text-on-surface-variant">
              Add Node
            </p>
            {[
              {
                label: "Walrus",
                subtitle: "Store manifest",
                color: "text-purple-400",
              },
              {
                label: "Harbor",
                subtitle: "Seal encrypt",
                color: "text-blue-400",
              },
              { label: "Sui", subtitle: "Execute PTB", color: "text-cyan-400" },
              {
                label: "Memory",
                subtitle: "Walrus storage",
                color: "text-purple-400",
              },
              {
                label: "Trigger",
                subtitle: "Manual start",
                color: "text-orange-400",
              },
              {
                label: "Delegate",
                subtitle: "Sub-agent",
                color: "text-green-400",
              },
            ].map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => {
                  const id = `${item.label.toLowerCase()}-${Date.now()}`;
                  setNodes((nds) => [
                    ...nds,
                    {
                      id,
                      type: "skill",
                      position: {
                        x: 300 + Math.random() * 200,
                        y: 200 + Math.random() * 150,
                      },
                      data: { label: item.label, subtitle: item.subtitle },
                    },
                  ]);
                  setShowAddMenu(false);
                }}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-surface-container"
              >
                <span className={`font-mono text-sm font-bold ${item.color}`}>
                  {item.label.charAt(0)}
                </span>
                <div>
                  <p className="font-mono text-xs font-bold text-on-surface">
                    {item.label}
                  </p>
                  <p className="font-mono text-[10px] text-on-surface-variant">
                    {item.subtitle}
                  </p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
