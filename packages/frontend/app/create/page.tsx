"use client";

import { useCallback, useEffect, useState } from "react";

import { CreateAgentModal } from "../../components/dashboard/create-agent-modal";
import { CreateWorkflowModal } from "../../components/dashboard/create-workflow-modal";
import type { WorkflowCardData } from "../../lib/registry-mappers";

/**
 * /create — Workflows page.
 * Lists published/draft workflows (each a SuiNS subname under an agent) as
 * cards, with a "Create Workflow" button that opens the workflow wizard:
 * pick an agent → name it → mint subname → open the canvas.
 */
export default function WorkflowsPage() {
  const [workflows, setWorkflows] = useState<WorkflowCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [showCreateWorkflow, setShowCreateWorkflow] = useState(false);
  const [showCreateAgent, setShowCreateAgent] = useState(false);

  const loadWorkflows = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/workflows", { cache: "no-store" });
      const data = (await res.json()) as { workflows?: WorkflowCardData[] };
      setWorkflows(data.workflows ?? []);
    } catch {
      setWorkflows([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWorkflows();
  }, [loadWorkflows]);

  const filtered = workflows.filter(
    (w) =>
      !search ||
      w.name.toLowerCase().includes(search.toLowerCase()) ||
      w.suinsName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="min-h-screen px-8 py-6">
      {/* Page header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold text-on-surface">
            Workflows
          </h1>
          <p className="mt-1 font-mono text-sm text-on-surface-variant">
            Compose your agents&apos; skills into published workflows
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreateWorkflow(true)}
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
            {workflows.length === 0
              ? "No workflows yet. Create your first one."
              : "No workflows match your search."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {filtered.map((wf) => (
            <WorkflowCard key={wf.slug} workflow={wf} />
          ))}
        </div>
      )}

      {/* Create Workflow modal */}
      <CreateWorkflowModal
        open={showCreateWorkflow}
        onClose={() => setShowCreateWorkflow(false)}
        onCreated={loadWorkflows}
        onRequestCreateAgent={() => setShowCreateAgent(true)}
      />

      {/* Create Agent Passport modal (opened when the user has no agents) */}
      <CreateAgentModal
        open={showCreateAgent}
        onClose={() => setShowCreateAgent(false)}
      />
    </div>
  );
}

// ===== Workflow Card =====

function WorkflowCard({ workflow }: { workflow: WorkflowCardData }) {
  return (
    <a
      href={`/create/${workflow.slug}`}
      className="group block border-[3px] border-pure-black bg-white p-8 neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_#6800FF]"
    >
      <div className="mb-4 flex items-start gap-4">
        <div className="flex h-12 w-12 items-center justify-center border-2 border-electric-purple bg-electric-purple/10 font-mono text-lg font-bold text-electric-purple">
          {workflow.name.charAt(0).toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-bold text-on-surface group-hover:text-electric-purple">
            {workflow.name}
          </p>
          <p className="truncate font-mono text-[10px] text-on-surface-variant">
            {workflow.suinsName}
          </p>
        </div>
        <span
          className={`shrink-0 border-2 px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
            workflow.published
              ? "border-green-800 bg-green-100 text-green-800"
              : "border-gray-400 bg-gray-100 text-gray-600"
          }`}
        >
          {workflow.published ? "Published" : "Draft"}
        </span>
      </div>

      {/* Stats */}
      <div className="flex gap-6 border-t-2 border-pure-black/10 pt-3">
        <div>
          <p className="font-mono text-[10px] uppercase text-on-surface-variant">
            Nodes
          </p>
          <p className="font-mono text-sm font-bold text-on-surface">
            {workflow.nodeCount ?? "—"}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase text-on-surface-variant">
            Network
          </p>
          <p className="font-mono text-sm font-bold text-on-surface">
            {workflow.network}
          </p>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase text-on-surface-variant">
            Status
          </p>
          <p className="font-mono text-sm font-bold text-on-surface capitalize">
            {workflow.status}
          </p>
        </div>
      </div>
    </a>
  );
}
