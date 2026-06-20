"use client";

import { useCallback, useEffect, useState } from "react";

import type { AgentCardData } from "../../components/dashboard/agent-card";

/**
 * /create — Workflows page (replaces old "Create Agent" dashboard).
 * Lists existing agent workflows as cards, with a "Create Workflow" button
 * that opens the agent creation wizard.
 */
export default function WorkflowsPage() {
  const [agents, setAgents] = useState<AgentCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateModal, setShowCreateModal] = useState(false);

  const loadAgents = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/agents", { cache: "no-store" });
      const data = (await res.json()) as { agents?: AgentCardData[] };
      setAgents(data.agents ?? []);
    } catch {
      setAgents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAgents();
  }, [loadAgents]);

  const filtered = agents.filter(
    (a) =>
      !search ||
      a.displayName.toLowerCase().includes(search.toLowerCase()) ||
      a.slug.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen bg-white px-8 py-6">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-on-surface">
            Workflows
          </h1>
          <p className="mt-1 font-mono text-sm text-on-surface-variant">
            Manage and create your agent workflows
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 bg-electric-purple px-5 py-2.5 font-mono text-xs font-bold text-white transition-colors hover:bg-electric-purple/90"
        >
          + Create Workflow
        </button>
      </div>

      {/* Search */}
      <div className="mb-6 max-w-md">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search workflows..."
          className="w-full border border-gray-200 bg-[#f8f8fa] px-4 py-2.5 font-mono text-sm text-on-surface outline-none placeholder:text-on-surface-variant focus:border-electric-purple"
        />
      </div>

      {/* Workflow cards grid */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-32 animate-pulse border border-gray-200 bg-[#f8f8fa]"
            />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-mono text-sm text-on-surface-variant">
            {agents.length === 0
              ? "No workflows yet. Create your first one."
              : "No workflows match your search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((agent) => (
            <WorkflowCard key={agent.slug} agent={agent} />
          ))}
        </div>
      )}

      {/* Pagination — sticky bottom */}
      {agents.length > 0 && (
        <div className="fixed bottom-0 left-16 right-0 flex items-center justify-between border-t border-gray-200 bg-white px-8 py-3 md:left-56">
          <p className="font-mono text-xs text-on-surface-variant">
            Page 1 of 1
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled
              className="border border-gray-200 px-3 py-1 font-mono text-xs text-on-surface-variant disabled:opacity-40"
            >
              Previous
            </button>
            <button
              type="button"
              disabled
              className="border border-gray-200 px-3 py-1 font-mono text-xs text-on-surface-variant disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Create modal (reuse existing) */}
      {showCreateModal && (
        <CreateWorkflowModal
          onClose={() => setShowCreateModal(false)}
          onCreated={loadAgents}
        />
      )}
    </div>
  );
}

// ===== Workflow Card =====

function WorkflowCard({ agent }: { agent: AgentCardData }) {
  const skillCount = parseInt(agent.metric) || 0;

  return (
    <a
      href={`/create/${agent.slug}`}
      className="block border border-gray-200 bg-[#f8f8fa] p-5 transition-colors hover:border-electric-purple hover:bg-electric-purple/5"
    >
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center bg-gray-200 font-mono text-sm font-bold text-on-surface-variant">
          {agent.slug.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-mono text-sm font-bold text-on-surface">
            {agent.displayName}
          </p>
          <p className="font-mono text-[10px] text-on-surface-variant">
            Updated recently
          </p>
        </div>
      </div>

      {/* Stats */}
      <div className="flex gap-6 border-t border-gray-200 pt-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-on-surface-variant">
            Skills
          </p>
          <p className="font-mono text-sm font-bold text-on-surface">
            {skillCount || "—"}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase text-on-surface-variant">
            Network
          </p>
          <p className="font-mono text-sm font-bold text-on-surface">
            {agent.network}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase text-on-surface-variant">
            Status
          </p>
          <p className="font-mono text-sm text-on-surface-variant">—</p>
        </div>
      </div>
    </a>
  );
}

// ===== Create Workflow Modal (thin wrapper) =====

function CreateWorkflowModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  // Dynamically import the existing modal to avoid SSR issues
  const [Modal, setModal] = useState<React.ComponentType<{
    open: boolean;
    onClose: () => void;
    onCreated?: () => void;
  }> | null>(null);

  useEffect(() => {
    import("../../components/dashboard/create-agent-modal").then((mod) => {
      setModal(() => mod.CreateAgentModal);
    });
  }, []);

  if (!Modal) return null;

  return <Modal open onClose={onClose} onCreated={onCreated} />;
}
