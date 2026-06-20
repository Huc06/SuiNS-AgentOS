'use client';

import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  addEdge,
  useNodesState,
  useEdgesState,
  type Connection,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useCallback, useRef } from 'react';

const initialNodes: Node[] = [];
const initialEdges: Edge[] = [];

/**
 * React Flow canvas for composing agent skill workflows.
 * Supports drag-drop from the SkillPanel to add nodes.
 */
export function WorkflowCanvas() {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge(params, eds)),
    [setEdges],
  );

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const data = e.dataTransfer.getData('application/agentos-skill');
      if (!data) return;

      const skill = JSON.parse(data) as { id: string; name: string; agent: string };
      const bounds = reactFlowWrapper.current?.getBoundingClientRect();
      if (!bounds) return;

      const position = {
        x: e.clientX - bounds.left - 75,
        y: e.clientY - bounds.top - 25,
      };

      const newNode: Node = {
        id: `${skill.id}-${Date.now()}`,
        type: 'default',
        position,
        data: { label: skill.name },
        style: {
          border: '2px solid #000',
          borderRadius: '0',
          background: '#fff',
          fontFamily: 'var(--font-jetbrains-mono), monospace',
          fontSize: '12px',
          fontWeight: 700,
          padding: '12px 16px',
          boxShadow: '4px 4px 0 0 #6800FF',
        },
      };

      setNodes((nds) => [...nds, newNode]);
    },
    [setNodes],
  );

  return (
    <div ref={reactFlowWrapper} className="h-full w-full" onDragOver={onDragOver} onDrop={onDrop}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        fitView
        className="bg-surface-container"
        defaultEdgeOptions={{
          style: { stroke: '#6800FF', strokeWidth: 2 },
          type: 'smoothstep',
        }}
      >
        <Background color="#000" gap={20} size={1} />
        <Controls className="[&_button]:!border-2 [&_button]:!border-pure-black [&_button]:!bg-white" />
        <MiniMap
          className="!border-2 !border-pure-black !bg-off-white"
          nodeColor="#6800FF"
        />
      </ReactFlow>
    </div>
  );
}
