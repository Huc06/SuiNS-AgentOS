'use client';

import { useMemo, useState } from 'react';

import type { AgentSkillRow } from '../../lib/agent-types';
import { IconFilter } from '../dashboard/icons';
import { IconAdd } from './icons';
import { SkillListItem } from './skill-list-item';

type AgentManageContentProps = {
  agentSlug: string;
  displayName: string;
  passportVersion: string;
  initialSkills: AgentSkillRow[];
};

export function AgentManageContent({
  displayName,
  passportVersion,
  initialSkills,
}: AgentManageContentProps) {
  const [skills] = useState(initialSkills);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((s: AgentSkillRow) => {
      const matchesQuery =
        !q ||
        s.name.toLowerCase().includes(q) ||
        s.mvrPackage.toLowerCase().includes(q) ||
        s.objectId.toLowerCase().includes(q);
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [skills, query, statusFilter]);

  const cycleStatus = () => {
    setStatusFilter((s) =>
      s === 'all' ? 'active' : s === 'active' ? 'archived' : 'all',
    );
  };

  const statusLabel =
    statusFilter === 'all' ? 'All' : statusFilter === 'active' ? 'Active' : 'Archived';

  return (
    <div className="min-w-0 flex-1 overflow-x-hidden py-8 sm:py-12 lg:pl-8 xl:pl-12">
      <div className="mb-8 flex flex-col items-start justify-between gap-4 sm:mb-12 sm:gap-6 lg:flex-row lg:items-center">
        <div>
          <h1 className="mb-2 font-display text-3xl font-bold md:text-4xl">Manage Skills</h1>
          <p className="font-mono text-base text-on-surface-variant">
            {displayName} · {passportVersion} — skill descriptors from workspace registry.
          </p>
        </div>
        <button
          type="button"
          className="flex w-full items-center justify-center gap-2 border-2 border-pure-black bg-vibrant-blue px-6 py-3 font-display text-base font-semibold text-off-white neo-shadow transition-all hover:-translate-x-0.5 hover:-translate-y-0.5 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_0_#000] sm:w-auto sm:px-8 sm:py-4 sm:text-lg"
        >
          <IconAdd />
          Publish New Version
        </button>
      </div>

      <div className="mb-6 flex flex-col gap-3 border-2 border-pure-black bg-surface-container p-4 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
        <div className="relative min-w-0 w-full flex-1 sm:min-w-[12rem]">
          <IconFilter className="pointer-events-none absolute left-3 top-2.5 h-5 w-5 text-pure-black/40" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter by name or object ID…"
            className="w-full border-2 border-pure-black bg-white py-2 pl-10 pr-3 font-mono text-sm outline-none focus:border-electric-purple"
          />
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button
            type="button"
            onClick={cycleStatus}
            className="min-w-0 flex-1 border-2 border-pure-black bg-white px-3 py-2 font-mono text-xs font-bold transition-colors hover:bg-soft-lavender sm:flex-none sm:px-4 sm:text-sm"
          >
            Status: {statusLabel}
          </button>
          <button
            type="button"
            className="min-w-0 flex-1 border-2 border-pure-black bg-white px-3 py-2 font-mono text-xs font-bold transition-colors hover:bg-soft-lavender sm:flex-none sm:px-4 sm:text-sm"
          >
            Sort: Latest
          </button>
        </div>
      </div>

      <div className="min-w-0 space-y-6">
        {filtered.length > 0 ? (
          filtered.map((skill) => <SkillListItem key={skill.id} skill={skill} />)
        ) : (
          <p className="border-2 border-dashed border-pure-black py-12 text-center font-mono text-sm text-on-surface-variant">
            {skills.length === 0
              ? 'No skills registered yet. Import a skill from the dashboard.'
              : 'No skills match your filters.'}
          </p>
        )}
      </div>
    </div>
  );
}
