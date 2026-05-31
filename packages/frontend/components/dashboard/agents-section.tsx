'use client';

import { useState } from 'react';

import { AgentCard, type AgentCardData } from './agent-card';
import { IconFilter, IconSearch } from './icons';

const MOCK_AGENTS: AgentCardData[] = [
  {
    slug: 'alpha',
    displayName: '@alpha',
    version: 'Passport v1.2.4',
    network: 'mainnet',
    metric: '842k resolutions',
    trend: 'up',
    icon: 'package',
  },
  {
    slug: 'beta-agent',
    displayName: '@beta-agent',
    version: 'Passport v0.9.1-beta',
    network: 'testnet',
    metric: '120k resolutions',
    trend: 'up',
    icon: 'terminal',
  },
  {
    slug: 'walrus-bot',
    displayName: '@walrus-bot',
    version: 'Passport v2.1.0',
    network: 'mainnet',
    metric: '358k resolutions',
    trend: 'flat',
    icon: 'database',
  },
];

export function AgentsSection() {
  const [query, setQuery] = useState('');
  const filtered = MOCK_AGENTS.filter(
    (a) =>
      a.displayName.toLowerCase().includes(query.toLowerCase()) ||
      a.slug.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className="space-y-12">
      <div className="mb-8 flex items-center justify-between border-b-2 border-pure-black pb-4">
        <h2 className="font-display text-2xl font-semibold">Active Agents</h2>
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-electric-purple transition-opacity hover:opacity-70"
            aria-label="Filter agents"
          >
            <IconFilter className="h-6 w-6" />
          </button>
          <label className="relative flex items-center">
            <span className="sr-only">Search agents</span>
            <IconSearch className="pointer-events-none absolute left-0 h-5 w-5 text-electric-purple" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-0 max-w-0 border-0 bg-transparent pl-7 font-mono text-sm font-bold outline-none transition-all focus:w-36 focus:max-w-[9rem] focus:border-b-2 focus:border-pure-black"
            />
          </label>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3">
        {filtered.length > 0 ? (
          filtered.map((agent) => <AgentCard key={agent.slug} agent={agent} />)
        ) : (
          <p className="col-span-full font-mono text-sm text-on-surface-variant">
            No agents match your search.
          </p>
        )}
      </div>
    </div>
  );
}
