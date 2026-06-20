'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AgentCardData } from '../dashboard/agent-card';

interface SkillPanelProps {
  onDragSkill?: (skill: { id: string; name: string; agent: string }) => void;
}

/**
 * Skill discovery panel — left side of the workspace.
 * Lists available skills that can be dragged onto the canvas.
 */
export function SkillPanel({ onDragSkill }: SkillPanelProps) {
  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/agents', { cache: 'no-store' })
      .then((r) => r.json())
      .then((data: { agents?: AgentCardData[] }) => {
        setAgents(data.agents ?? []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const filtered = agents.filter(
    (a) =>
      !search ||
      a.displayName.toLowerCase().includes(search.toLowerCase()) ||
      a.slug.toLowerCase().includes(search.toLowerCase()),
  );

  const handleDragStart = useCallback(
    (e: React.DragEvent, agent: AgentCardData) => {
      e.dataTransfer.setData(
        'application/agentos-skill',
        JSON.stringify({ id: agent.slug, name: agent.displayName, agent: agent.slug }),
      );
      e.dataTransfer.effectAllowed = 'move';
      onDragSkill?.({ id: agent.slug, name: agent.displayName, agent: agent.slug });
    },
    [onDragSkill],
  );

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r-2 border-pure-black bg-off-white">
      {/* Header */}
      <div className="border-b-2 border-pure-black px-4 py-3">
        <h2 className="font-mono text-xs font-bold uppercase tracking-wider text-on-surface-variant">
          Skill Discovery
        </h2>
      </div>

      {/* Search */}
      <div className="border-b border-pure-black/10 px-4 py-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search skills..."
          className="w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-xs outline-none"
        />
      </div>

      {/* Skills list */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-3 font-mono text-[10px] font-bold uppercase text-on-surface-variant">
          Agents ({filtered.length})
        </p>

        {loading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 animate-pulse border-2 border-pure-black/20 bg-surface-container" />
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((agent) => (
              <div
                key={agent.slug}
                draggable
                onDragStart={(e) => handleDragStart(e, agent)}
                className="cursor-grab border-2 border-pure-black bg-white p-3 transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#6800FF] active:cursor-grabbing"
              >
                <p className="font-mono text-xs font-bold">{agent.displayName}</p>
                <p className="mt-1 font-mono text-[10px] text-on-surface-variant">
                  {agent.metric} · {agent.network}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
