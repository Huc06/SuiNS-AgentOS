"use client";

import { useCallback, useEffect, useState } from "react";

import type { AgentCardData } from "./agent-card";
import { AgentCard } from "./agent-card";
import { IconFilter, IconSearch } from "./icons";
import { EmptyState, ErrorAlert, SkeletonCard } from "../ui/skeleton";

type AgentsSectionProps = {
  refreshKey?: number;
};

export function AgentsSection({ refreshKey = 0 }: AgentsSectionProps) {
  const [query, setQuery] = useState("");
  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      const data = (await res.json()) as {
        agents?: AgentCardData[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setAgents(data.agents ?? []);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Could not load agents");
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents, refreshKey]);

  const filtered = agents.filter(
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

      {loadError && <ErrorAlert message={loadError} onRetry={loadAgents} />}

      {loading ? (
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-gutter md:grid-cols-2 lg:grid-cols-3">
          {filtered.length > 0 ? (
            filtered.map((agent) => (
              <AgentCard key={agent.slug} agent={agent} />
            ))
          ) : agents.length === 0 ? (
            <EmptyState
              title="No agents yet"
              description="Create your first AI agent with a .sui name and on-chain passport."
              actionLabel="Create Agent"
              actionHref="/create"
            />
          ) : (
            <EmptyState
              title="No agents match your search"
              description="Try a different search term."
            />
          )}
        </div>
      )}
    </div>
  );
}
