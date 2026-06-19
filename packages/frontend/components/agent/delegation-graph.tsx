'use client';

import type { DelegationRecord } from '../../lib/delegation-types';
import { getDelegationStatus, type DelegationStatus } from '../../lib/delegation-types';

interface DelegationGraphProps {
  delegations: DelegationRecord[];
  parentName: string;
}

const NODE_W = 140;
const NODE_H = 40;
const GAP_X = 180;
const GAP_Y = 70;
const PADDING = 40;

function truncateLabel(label: string, max = 14): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

const statusColors: Record<DelegationStatus, { stroke: string; fill: string }> = {
  active: { stroke: '#000', fill: '#fff' },
  expiring: { stroke: '#d97706', fill: '#fffbeb' },
  expired: { stroke: '#9ca3af', fill: '#f3f4f6' },
  revoked: { stroke: '#ba1a1a', fill: '#fef2f2' },
};

/**
 * Custom SVG delegation graph — parent → sub-agents.
 * Modeled on skill-dependency-graph.tsx (no npm dependencies).
 */
export function DelegationGraph({ delegations, parentName }: DelegationGraphProps) {
  if (delegations.length === 0) {
    return (
      <div className="border-2 border-dashed border-pure-black/30 bg-white px-8 py-6 text-center">
        <p className="font-mono text-sm text-on-surface-variant">
          No delegations yet — grant one above.
        </p>
      </div>
    );
  }

  const rows = delegations.length;
  const svgW = PADDING * 2 + NODE_W + GAP_X + NODE_W;
  const svgH = PADDING * 2 + rows * GAP_Y;

  // Parent node position
  const parentX = PADDING;
  const parentY = PADDING + ((rows - 1) * GAP_Y) / 2;

  return (
    <div className="overflow-x-auto border-2 border-pure-black bg-white neo-shadow">
      <svg
        width={svgW}
        height={svgH}
        viewBox={`0 0 ${svgW} ${svgH}`}
        role="img"
        aria-label={`Delegation graph for ${parentName}`}
        className="min-w-[400px]"
      >
        <defs>
          <marker
            id="arrow-delegation"
            viewBox="0 0 10 7"
            refX="10"
            refY="3.5"
            markerWidth="8"
            markerHeight="6"
            orient="auto-start-reverse"
          >
            <polygon points="0 0, 10 3.5, 0 7" fill="#6800FF" />
          </marker>
        </defs>

        {/* Parent node */}
        <rect
          x={parentX}
          y={parentY}
          width={NODE_W}
          height={NODE_H}
          fill="#CAB1FF"
          stroke="#000"
          strokeWidth={2}
        />
        <text
          x={parentX + NODE_W / 2}
          y={parentY + NODE_H / 2 + 5}
          textAnchor="middle"
          className="font-mono text-xs font-bold"
          fill="#000"
        >
          {truncateLabel(parentName)}
        </text>

        {/* Child nodes + edges */}
        {delegations.map((del, i) => {
          const childX = PADDING + NODE_W + GAP_X;
          const childY = PADDING + i * GAP_Y;
          const status = getDelegationStatus(del);
          const colors = statusColors[status];

          // Edge: parent right center → child left center
          const x1 = parentX + NODE_W;
          const y1 = parentY + NODE_H / 2;
          const x2 = childX;
          const y2 = childY + NODE_H / 2;
          const cx1 = x1 + 40;
          const cx2 = x2 - 40;

          return (
            <g key={del.id ?? i}>
              {/* Edge */}
              <path
                d={`M${x1},${y1} C${cx1},${y1} ${cx2},${y2} ${x2},${y2}`}
                fill="none"
                stroke={status === 'revoked' || status === 'expired' ? '#9ca3af' : '#6800FF'}
                strokeWidth={2}
                strokeDasharray={status === 'revoked' || status === 'expired' ? '4 4' : undefined}
                markerEnd="url(#arrow-delegation)"
              />

              {/* Edge label: caps count + spend */}
              <text
                x={(x1 + x2) / 2}
                y={(y1 + y2) / 2 - 8}
                textAnchor="middle"
                className="font-mono text-[9px]"
                fill="#494457"
              >
                {del.allowedCapabilities.length} caps · {(parseInt(del.spendLimit) / 1e9).toFixed(1)} SUI
              </text>

              {/* Child node */}
              <rect
                x={childX}
                y={childY}
                width={NODE_W}
                height={NODE_H}
                fill={colors.fill}
                stroke={colors.stroke}
                strokeWidth={2}
                strokeDasharray={status === 'revoked' ? '4 4' : undefined}
              />
              <text
                x={childX + NODE_W / 2}
                y={childY + NODE_H / 2 + 5}
                textAnchor="middle"
                className="font-mono text-xs font-bold"
                fill={colors.stroke}
              >
                {truncateLabel(del.childName || del.childAgent.slice(0, 10))}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
