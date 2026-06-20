"use client";

import { useCallback, useEffect, useState } from "react";

import type { AgentCardData } from "../dashboard/agent-card";
import { AgentCard } from "../dashboard/agent-card";
import { EmptyState, ErrorAlert, SkeletonCard } from "../ui/skeleton";

type FilterNetwork = "all" | "mainnet" | "testnet";

const filterChips: { value: FilterNetwork; label: string }[] = [
  { value: "all", label: "All" },
  { value: "mainnet", label: "Mainnet" },
  { value: "testnet", label: "Testnet" },
];

/**
 * Live Agent Explorer — fetches real agents from /api/agents and renders
 * a filterable grid on the landing page (Hero Moment #1).
 */
export function AgentExplorer() {
  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [networkFilter, setNetworkFilter] = useState<FilterNetwork>("all");
  const [hasSkillsOnly, setHasSkillsOnly] = useState(false);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      const data = (await res.json()) as {
        agents?: AgentCardData[];
        error?: string;
      };
      if (!res.ok) throw new Error(data.error ?? `Failed (${res.status})`);
      setAgents(data.agents ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load agents");
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
    if (networkFilter !== "all" && agent.network !== networkFilter)
      return false;
    if (hasSkillsOnly && agent.metric === "No skills yet") return false;
    return true;
  });

  return (
    <section className="mx-auto max-w-container px-margin py-16">
      {/* Section header */}
      <div className="mb-8 flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="mb-2 inline-block border-2 border-electric-purple bg-electric-purple/10 px-3 py-1 font-mono text-xs font-bold uppercase text-electric-purple">
            Public Directory
          </div>
          <h2 className="font-display text-3xl font-bold text-on-surface">
            Agents Named on Sui
          </h2>
          <p className="mt-1 font-mono text-sm text-on-surface-variant">
            {agents.length > 0
              ? `${agents.length} agent${agents.length === 1 ? "" : "s"} with .sui identities — resolve by name, execute skills, delegate.`
              : "Discover AI agents with on-chain passports on the Sui network."}
          </p>
        </div>
        <a
          href="/create"
          className="mt-1 inline-flex items-center gap-2 border-2 border-pure-black bg-electric-purple px-4 py-2 font-mono text-xs font-bold text-white shadow-[3px_3px_0_0_#000] transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_#000]"
        >
          + Create Agent Passport
        </a>
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
                ? "border-2 border-electric-purple bg-electric-purple px-3 py-1 font-mono text-xs font-bold text-off-white"
                : "border-2 border-pure-black bg-white px-3 py-1 font-mono text-xs font-bold text-on-surface transition-colors hover:bg-surface-container"
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
              ? "border-2 border-electric-purple bg-electric-purple px-3 py-1 font-mono text-xs font-bold text-off-white"
              : "border-2 border-pure-black bg-white px-3 py-1 font-mono text-xs font-bold text-on-surface transition-colors hover:bg-surface-container"
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
