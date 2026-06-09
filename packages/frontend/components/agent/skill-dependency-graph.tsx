"use client";

import { useMemo } from "react";

import type { AgentSkillRow } from "../../lib/agent-types";

/**
 * Minimal node shape the graph needs. Any object exposing an id, a label,
 * and a list of dependency ids can be rendered.
 */
export interface DependencyGraphSkill {
  /** Canonical id used to match dependency references. */
  id: string;
  /** Human-readable label rendered inside the node. */
  label: string;
  /** Alternate identifiers a dependency string might reference (suinsName, mvr package, …). */
  aliases?: string[];
  /** SuiNS subnames / ids of skills this skill depends on. */
  dependencies: string[];
}

interface GraphNode {
  id: string;
  label: string;
  /** True when the node is referenced as a dependency but not in the skill list. */
  external: boolean;
  level: number;
  x: number;
  y: number;
}

interface GraphEdge {
  from: string;
  to: string;
}

// Layout constants (SVG user units).
const NODE_WIDTH = 168;
const NODE_HEIGHT = 56;
const COL_GAP = 96;
const ROW_GAP = 28;
const PADDING = 16;

/**
 * Maps an arbitrary skill row to the graph's node shape. The skill name and
 * any suins subname are treated as aliases so dependency strings resolve.
 */
export function skillRowToGraphSkill(
  skill: AgentSkillRow,
): DependencyGraphSkill {
  return {
    id: skill.id,
    label: skill.name,
    aliases: [skill.name, skill.mvrPackage],
    dependencies: skill.dependencies ?? [],
  };
}

interface ResolvedGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
}

/**
 * Builds a layered DAG layout from the skills. Nodes referenced as
 * dependencies but absent from the list become external "ghost" nodes.
 * Levels are assigned so dependencies sit left of the skills that need them.
 * Cycles are tolerated defensively via a visited guard.
 */
function buildGraph(skills: DependencyGraphSkill[]): ResolvedGraph {
  // Resolve every dependency reference to a canonical node id.
  const aliasToId = new Map<string, string>();
  for (const skill of skills) {
    aliasToId.set(skill.id, skill.id);
    for (const alias of skill.aliases ?? []) {
      if (alias) aliasToId.set(alias, skill.id);
    }
  }

  const nodeMap = new Map<string, { label: string; external: boolean }>();
  for (const skill of skills) {
    nodeMap.set(skill.id, { label: skill.label, external: false });
  }

  // depends.get(nodeId) -> set of dependency node ids.
  const dependsOn = new Map<string, Set<string>>();
  const edges: GraphEdge[] = [];

  for (const skill of skills) {
    const deps = new Set<string>();
    for (const rawDep of skill.dependencies) {
      const depId = aliasToId.get(rawDep) ?? rawDep;
      if (depId === skill.id) continue; // ignore self-references
      if (!nodeMap.has(depId)) {
        nodeMap.set(depId, { label: rawDep, external: true });
      }
      if (!deps.has(depId)) {
        deps.add(depId);
        edges.push({ from: skill.id, to: depId });
      }
    }
    dependsOn.set(skill.id, deps);
  }

  // Assign levels: a node sits one column right of its deepest dependency.
  const levelCache = new Map<string, number>();
  const computeLevel = (id: string, stack: Set<string>): number => {
    const cached = levelCache.get(id);
    if (cached !== undefined) return cached;
    if (stack.has(id)) return 0; // cycle guard
    stack.add(id);
    const deps = dependsOn.get(id);
    let level = 0;
    if (deps && deps.size > 0) {
      let maxDep = -1;
      for (const dep of deps) {
        maxDep = Math.max(maxDep, computeLevel(dep, stack));
      }
      level = maxDep + 1;
    }
    stack.delete(id);
    levelCache.set(id, level);
    return level;
  };

  for (const id of nodeMap.keys()) {
    computeLevel(id, new Set());
  }

  // Group nodes by level (column), keeping a stable order.
  const byLevel = new Map<number, GraphNode[]>();
  for (const [id, meta] of nodeMap.entries()) {
    const level = levelCache.get(id) ?? 0;
    const node: GraphNode = {
      id,
      label: meta.label,
      external: meta.external,
      level,
      x: 0,
      y: 0,
    };
    const bucket = byLevel.get(level);
    if (bucket) {
      bucket.push(node);
    } else {
      byLevel.set(level, [node]);
    }
  }

  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  const maxRows = Math.max(
    1,
    ...levels.map((level) => byLevel.get(level)?.length ?? 0),
  );

  const nodes: GraphNode[] = [];
  for (const level of levels) {
    const column = byLevel.get(level) ?? [];
    const columnHeight =
      column.length * NODE_HEIGHT + (column.length - 1) * ROW_GAP;
    const totalHeight = maxRows * NODE_HEIGHT + (maxRows - 1) * ROW_GAP;
    const yOffset = (totalHeight - columnHeight) / 2;
    column.forEach((node, row) => {
      node.x = PADDING + level * (NODE_WIDTH + COL_GAP);
      node.y = PADDING + yOffset + row * (NODE_HEIGHT + ROW_GAP);
      nodes.push(node);
    });
  }

  const columns = levels.length;
  const width =
    PADDING * 2 + columns * NODE_WIDTH + Math.max(0, columns - 1) * COL_GAP;
  const height =
    PADDING * 2 + maxRows * NODE_HEIGHT + Math.max(0, maxRows - 1) * ROW_GAP;

  return { nodes, edges, width, height };
}

function truncateLabel(label: string, max = 20): string {
  if (label.length <= max) return label;
  return `${label.slice(0, max - 1)}…`;
}

export function SkillDependencyGraph({
  skills,
  className,
}: {
  skills: DependencyGraphSkill[];
  className?: string;
}) {
  const graph = useMemo(() => buildGraph(skills), [skills]);
  const nodeById = useMemo(() => {
    const map = new Map<string, GraphNode>();
    for (const node of graph.nodes) map.set(node.id, node);
    return map;
  }, [graph]);

  if (graph.edges.length === 0) {
    return (
      <p
        className={`border-2 border-dashed border-pure-black py-8 text-center font-mono text-sm text-on-surface-variant ${className ?? ""}`}
      >
        No dependencies between skills.
      </p>
    );
  }

  return (
    <div
      className={`max-w-full overflow-x-auto border-2 border-pure-black bg-white p-4 neo-shadow ${className ?? ""}`}
    >
      <svg
        role="img"
        aria-label="Skill dependency graph"
        width={graph.width}
        height={graph.height}
        viewBox={`0 0 ${graph.width} ${graph.height}`}
        className="block"
      >
        <defs>
          <marker
            id="skill-dep-arrow"
            markerWidth="8"
            markerHeight="8"
            refX="7"
            refY="4"
            orient="auto"
            markerUnits="userSpaceOnUse"
          >
            <path d="M0,0 L8,4 L0,8 Z" fill="#6800FF" />
          </marker>
        </defs>

        {graph.edges.map((edge) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;
          // Edge runs from the dependent (right) to the dependency (left edge).
          const startX = from.x;
          const startY = from.y + NODE_HEIGHT / 2;
          const endX = to.x + NODE_WIDTH;
          const endY = to.y + NODE_HEIGHT / 2;
          const midX = (startX + endX) / 2;
          const path = `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`;
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              d={path}
              fill="none"
              stroke="#6800FF"
              strokeWidth={2}
              markerEnd="url(#skill-dep-arrow)"
            />
          );
        })}

        {graph.nodes.map((node) => (
          <g key={node.id}>
            <rect
              x={node.x}
              y={node.y}
              width={NODE_WIDTH}
              height={NODE_HEIGHT}
              fill={node.external ? "#FAF8F5" : "#FFFFFF"}
              stroke="#000000"
              strokeWidth={2}
              strokeDasharray={node.external ? "6 4" : undefined}
            />
            <text
              x={node.x + NODE_WIDTH / 2}
              y={
                node.y +
                (node.external ? NODE_HEIGHT / 2 - 4 : NODE_HEIGHT / 2 + 4)
              }
              textAnchor="middle"
              fontFamily="var(--font-jetbrains-mono), ui-monospace, monospace"
              fontSize={13}
              fontWeight={600}
              fill="#000000"
            >
              {truncateLabel(node.label)}
            </text>
            {node.external && (
              <text
                x={node.x + NODE_WIDTH / 2}
                y={node.y + NODE_HEIGHT / 2 + 12}
                textAnchor="middle"
                fontFamily="var(--font-jetbrains-mono), ui-monospace, monospace"
                fontSize={9}
                fontWeight={700}
                fill="#494457"
              >
                EXTERNAL
              </text>
            )}
          </g>
        ))}
      </svg>
    </div>
  );
}
