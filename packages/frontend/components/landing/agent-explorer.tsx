'use client';

import { useCallback, useEffect, useState } from 'react';

import type { AgentCardData } from '../dashboard/agent-card';
import { AgentCard } from '../dashboard/agent-card';
import { EmptyState, ErrorAlert, SkeletonCard } from '../ui/skeleton';

type FilterNetwork = 'all' | 'mainnet' | 'testnet';

const filterChips: { value: FilterNetwork; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'mainnet', label: 'Mainnet' },
  { value: 'testnet', label: 'Testnet' },
];

/**
 * Live Agent Explorer — fetches real agents from /api/agents and renders
 * a filterable grid on the landing page (Hero Moment #1).
 */
export function AgentExplorer() {
  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [networkFilter, setNetworkFilter] = useState<FilterNetwork>('all');
  const [hasSkillsOnly, setHasSkillsOnly] = useState(false);
  const [search, setSearch] = useState('');

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/agents', { cache: 'no-store' });
      const data = (await res.json()) as { agents?: AgentCardData[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setAgents(data.agents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load agents');
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  // Apply filters
  const filtered = agents.filter((agent) => {
    if (networkFilter !== 'all' && agent.network !== networkFilter) return false;
    if (hasSkillsOnly && agent.metric === 'No skills yet') return false;
    if (search) {
      const q = search.toLowerCase();
      if (
        !agent.displayName.toLowerCase().includes(q) &&
        !agent.slug.toLowerCase().includes(q)
      )
        return false;
    }
    return true;
  });

  return (
    <section className="mx-auto max-w-container px-margin py-16">
      {/* Section header */}
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-3xl font-bold text-on-surface">
            Live Agent Explorer
          </h2>
          <p className="mt-1 font-mono text-sm text-on-surface-variant">
            {agents.length > 0
              ? `${agents.length} agent${agents.length === 1 ? '' : 's'} named on Sui`
              : 'Discover AI agents on the Sui network'}
          </p>
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-64">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter agents…"
            className="w-full border-2 border-pure-black bg-white px-3 py-2 pl-9 font-mono text-sm outline-none neo-shadow focus:neo-shadow-lg"
          />
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-on-surface-variant"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2.5}
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M16.5 16.5L21 21" strokeLinecap="square" />
          </svg>
        </div>
      </div>

      {/* Filter chips */}
      <div className="mb-6 flex flex-wrap items-center gap-2">
        {filterChips.map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setNetworkFilter(chip.value)}
            className={
              networkFilter === chip.value
                ? 'border-2 border-electric-purple bg-electric-purple px-3 py-1 font-mono text-xs font-bold text-off-white'
                : 'border-2 border-pure-black bg-white px-3 py-1 font-mono text-xs font-bold text-on-surface transition-colors hover:bg-surface-container'
            }
          >
            {chip.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setHasSkillsOnly(!hasSkillsOnly)}
          className={
            hasSkillsOnly
              ? 'border-2 border-electric-purple bg-electric-purple px-3 py-1 font-mono text-xs font-bold text-off-white'
              : 'border-2 border-pure-black bg-white px-3 py-1 font-mono text-xs font-bold text-on-surface transition-colors hover:bg-surface-container'
          }
        >
          Has skills
        </button>
      </div>

      {/* Error state */}
      {error && <ErrorAlert message={error} onRetry={loadAgents} />}

      {/* Grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : filtered.length > 0 ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <AgentCard key={agent.slug} agent={agent} />
          ))}
        </div>
      ) : agents.length === 0 ? (
        <EmptyState
          title="No agents yet — create the first one"
          description="Mint an AgentPassport with a .sui name and start building."
          actionLabel="Create Agent"
          actionHref="/create"
        />
      ) : (
        <EmptyState
          title="No agents match your filters"
          description="Try adjusting the network filter or search term."
        />
      )}
    </section>
  );
}
