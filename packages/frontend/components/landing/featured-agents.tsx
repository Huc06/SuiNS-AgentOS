"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import type { AgentCardData } from "../dashboard/agent-card";

/**
 * "Try:" chips on the hero — derived from the first 3 agents
 * returned by /api/agents instead of hardcoded entries.
 */
export function FeaturedAgents() {
  const [agents, setAgents] = useState<AgentCardData[]>([]);

  useEffect(() => {
    fetch("/api/agents", { cache: "no-store" })
      .then((r) => r.json())
      .then((data: { agents?: AgentCardData[] }) => {
        setAgents((data.agents ?? []).slice(0, 3));
      })
      .catch(() => {
        /* silent — chips just won't show */
      });
  }, []);

  if (agents.length === 0) return null;

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs font-bold uppercase text-on-surface-variant">
        Try:
      </span>
      {agents.map((a) => (
        <Link
          key={a.slug}
          href={`/agent/${a.slug}`}
          className="border-2 border-pure-black bg-white px-3 py-1 font-mono text-xs font-bold transition-colors hover:bg-soft-lavender"
        >
          @{a.slug}
          <span className="ml-1 text-on-surface-variant">({a.network})</span>
        </Link>
      ))}
    </div>
  );
}
