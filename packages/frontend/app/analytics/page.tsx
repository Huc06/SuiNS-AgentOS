"use client";

import { useEffect, useMemo, useState } from "react";

// ===== Response shapes (mirror /api/analytics) =====

const NODE_TYPES = [
  "trigger",
  "walrus",
  "harbor",
  "sui",
  "memory",
  "memory-recall",
  "import-agent",
  "call-sub-agent",
  "delegate",
  "attest",
] as const;
type NodeType = (typeof NODE_TYPES)[number];

type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

interface PerAgentAnalytics {
  slug: string;
  suinsName: string;
  network: "mainnet" | "testnet";
  status: "active" | "revoked";
  skillCount: number;
  delegationCount: number;
  runCount: number;
  doneRuns: number;
  errorRuns: number;
  successRate: number;
  stepStatusMix: Record<StepStatus, number>;
  nodeTypeMix: Record<NodeType, number>;
  topSkills: Array<{ name: string; resolutions: number }>;
  lastRunAt: string | null;
}

interface AnalyticsResponse {
  totals: {
    agents: number;
    activeAgents: number;
    skills: number;
    delegations: number;
    runs: number;
    doneRuns: number;
    errorRuns: number;
    successRate: number;
  };
  nodeTypeMix: Record<NodeType, number>;
  agents: PerAgentAnalytics[];
  generatedAt: string;
}

// ===== Status colors for the step-mix bar =====

const STATUS_COLOR: Record<StepStatus, string> = {
  done: "#6800FF",
  skipped: "#CAB1FF",
  error: "#ba1a1a",
  running: "#0098F5",
  pending: "#dadada",
};

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "—";
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export default function AnalyticsPage() {
  const [data, setData] = useState<AnalyticsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analytics", { cache: "no-store" });
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const json = (await res.json()) as AnalyticsResponse;
        if (!cancelled) setData(json);
      } catch (e) {
        if (!cancelled)
          setError(e instanceof Error ? e.message : "Failed to load analytics");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const maxNode = useMemo(() => {
    if (!data) return 0;
    return Math.max(1, ...NODE_TYPES.map((t) => data.nodeTypeMix[t] ?? 0));
  }, [data]);

  return (
    <main className="min-h-screen px-6 py-6">
      <header className="mb-6">
        <h1 className="font-display text-2xl font-bold text-pure-black">
          Analytics
        </h1>
        <p className="mt-1 font-mono text-xs text-black/60">
          Aggregated from the agent registry + workflow runs. Source:{" "}
          <code className="text-black/80">/api/analytics</code>
          {data ? (
            <span className="ml-2 text-black/40">
              · updated {formatRelative(data.generatedAt)}
            </span>
          ) : null}
        </p>
      </header>

      {error ? (
        <Panel>
          <p className="font-display text-base font-bold text-pure-black">
            Couldn&apos;t load analytics
          </p>
          <p className="mt-2 font-mono text-xs text-black/60">{error}</p>
        </Panel>
      ) : !data ? (
        <Panel>
          <p className="font-mono text-xs text-black/60">Loading analytics…</p>
        </Panel>
      ) : (
        <>
          {/* Stat cards */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            <StatCard label="Agents" value={data.totals.agents} sub={`${data.totals.activeAgents} active`} />
            <StatCard label="Skills" value={data.totals.skills} sub={`${data.totals.delegations} delegations`} />
            <StatCard label="Runs" value={data.totals.runs} sub={`${data.totals.doneRuns} done · ${data.totals.errorRuns} error`} />
            <StatCard label="Success rate" value={pct(data.totals.successRate)} sub="completed runs" accent />
          </div>

          {/* Platform node-type usage bar chart */}
          <section className="mt-6">
            <SectionTitle>Workflow node usage</SectionTitle>
            <Panel>
              {data.totals.runs === 0 ? (
                <p className="font-mono text-xs text-black/50">
                  No workflow runs recorded yet. Run a workflow from the canvas to
                  populate node usage.
                </p>
              ) : (
                <div className="space-y-2">
                  {NODE_TYPES.map((t) => {
                    const count = data.nodeTypeMix[t] ?? 0;
                    const width = (count / maxNode) * 100;
                    return (
                      <div key={t} className="flex items-center gap-3">
                        <span className="w-28 shrink-0 truncate font-mono text-[11px] font-bold text-black/70">
                          {t}
                        </span>
                        <div className="h-5 flex-1 border border-pure-black bg-off-white">
                          <div
                            className="h-full bg-electric-purple"
                            style={{ width: `${width}%` }}
                          />
                        </div>
                        <span className="w-8 shrink-0 text-right font-mono text-[11px] font-bold text-pure-black">
                          {count}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
          </section>

          {/* Per-agent breakdown */}
          <section className="mt-6">
            <SectionTitle>Per-agent breakdown</SectionTitle>
            {data.agents.length === 0 ? (
              <Panel>
                <p className="font-mono text-xs text-black/50">
                  No agents in the registry yet.
                </p>
              </Panel>
            ) : (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                {data.agents.map((agent) => (
                  <AgentCard key={agent.slug} agent={agent} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

function AgentCard({ agent }: { agent: PerAgentAnalytics }) {
  const statusTotal =
    (Object.keys(agent.stepStatusMix) as StepStatus[]).reduce(
      (sum, s) => sum + agent.stepStatusMix[s],
      0,
    ) || 0;

  return (
    <div className="border-2 border-pure-black bg-white p-4 shadow-neo">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-mono text-sm font-bold text-pure-black" title={agent.suinsName}>
            {agent.suinsName}
          </p>
          <div className="mt-1 flex items-center gap-2">
            <span className="border border-pure-black bg-off-white px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase text-pure-black">
              {agent.network}
            </span>
            <span
              className={`border border-pure-black px-1.5 py-0.5 font-mono text-[9px] font-bold uppercase ${
                agent.status === "active"
                  ? "bg-electric-purple/10 text-electric-purple"
                  : "bg-error/10 text-error"
              }`}
            >
              {agent.status}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="font-mono text-lg font-bold leading-none text-pure-black">
            {pct(agent.successRate)}
          </p>
          <p className="font-mono text-[9px] font-bold uppercase text-black/40">
            success
          </p>
        </div>
      </div>

      {/* Mini metrics */}
      <div className="mt-3 grid grid-cols-4 gap-2">
        <Mini label="Runs" value={agent.runCount} />
        <Mini label="Done" value={agent.doneRuns} />
        <Mini label="Skills" value={agent.skillCount} />
        <Mini label="Deleg" value={agent.delegationCount} />
      </div>

      {/* Step-status mix bar */}
      {statusTotal > 0 ? (
        <div className="mt-3">
          <p className="mb-1 font-mono text-[9px] font-bold uppercase text-black/40">
            Step status mix ({statusTotal})
          </p>
          <div className="flex h-3 w-full overflow-hidden border border-pure-black">
            {(["done", "skipped", "running", "pending", "error"] as StepStatus[]).map(
              (s) => {
                const v = agent.stepStatusMix[s];
                if (v === 0) return null;
                return (
                  <div
                    key={s}
                    title={`${s}: ${v}`}
                    style={{
                      width: `${(v / statusTotal) * 100}%`,
                      backgroundColor: STATUS_COLOR[s],
                    }}
                  />
                );
              },
            )}
          </div>
        </div>
      ) : (
        <p className="mt-3 font-mono text-[10px] text-black/40">
          No runs recorded for this agent yet.
        </p>
      )}

      {/* Top skills */}
      {agent.topSkills.length > 0 ? (
        <div className="mt-3">
          <p className="mb-1 font-mono text-[9px] font-bold uppercase text-black/40">
            Most-used skills
          </p>
          <div className="flex flex-wrap gap-1.5">
            {agent.topSkills.map((s) => (
              <span
                key={s.name}
                className="border border-pure-black bg-off-white px-1.5 py-0.5 font-mono text-[9px] font-bold text-pure-black"
              >
                {s.name}
                {s.resolutions > 0 ? (
                  <span className="ml-1 text-electric-purple">{s.resolutions}</span>
                ) : null}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      <p className="mt-3 font-mono text-[9px] font-bold uppercase text-black/30">
        last run {formatRelative(agent.lastRunAt)}
      </p>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: number | string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={`border-2 border-pure-black p-4 shadow-neo ${
        accent ? "bg-electric-purple text-white" : "bg-white text-pure-black"
      }`}
    >
      <p
        className={`font-mono text-[10px] font-bold uppercase ${
          accent ? "text-white/70" : "text-black/50"
        }`}
      >
        {label}
      </p>
      <p className="mt-1 font-display text-3xl font-bold leading-none">{value}</p>
      <p
        className={`mt-2 font-mono text-[10px] font-bold ${
          accent ? "text-white/70" : "text-black/50"
        }`}
      >
        {sub}
      </p>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-pure-black bg-off-white px-2 py-1 text-center">
      <p className="font-mono text-base font-bold leading-none text-pure-black">
        {value}
      </p>
      <p className="mt-0.5 font-mono text-[8px] font-bold uppercase text-black/40">
        {label}
      </p>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 font-mono text-[11px] font-bold uppercase tracking-wide text-black/50">
      {children}
    </p>
  );
}

function Panel({ children }: { children: React.ReactNode }) {
  return (
    <div className="border-2 border-pure-black bg-white p-5 shadow-neo">
      {children}
    </div>
  );
}
