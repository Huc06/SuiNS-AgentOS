import { NextResponse } from 'next/server';

import { getRegistryStore } from '../../../lib/registry-server';
import { listRuns } from '../../../lib/runs-store';

export const dynamic = 'force-dynamic';

/**
 * GET /api/analytics
 *
 * Read-only aggregate over the shared local registry (agents + skills) and the
 * workflow runs store (one query per agent). Composes everything the Analytics
 * dashboard needs server-side so the client does a single fetch. No mutation.
 */

const NODE_TYPES = [
  'trigger',
  'walrus',
  'harbor',
  'sui',
  'memory',
  'memory-recall',
  'import-agent',
  'call-sub-agent',
  'delegate',
  'attest',
] as const;

type NodeType = (typeof NODE_TYPES)[number];

type StepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped';

interface PerAgentAnalytics {
  slug: string;
  suinsName: string;
  network: 'mainnet' | 'testnet';
  status: 'active' | 'revoked';
  skillCount: number;
  delegationCount: number;
  runCount: number;
  doneRuns: number;
  errorRuns: number;
  successRate: number; // 0..1 over completed runs
  /** Total step executions across all this agent's runs, by lifecycle status. */
  stepStatusMix: Record<StepStatus, number>;
  /** Count of step executions per workflow node type (how the agent works). */
  nodeTypeMix: Record<NodeType, number>;
  /** Skills ranked by recorded resolutions (most-used first). */
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
    successRate: number; // 0..1 across all completed runs
  };
  /** Platform-wide step executions per node type (drives the bar chart). */
  nodeTypeMix: Record<NodeType, number>;
  agents: PerAgentAnalytics[];
  generatedAt: string;
}

function emptyNodeMix(): Record<NodeType, number> {
  return NODE_TYPES.reduce(
    (acc, t) => {
      acc[t] = 0;
      return acc;
    },
    {} as Record<NodeType, number>,
  );
}

function emptyStatusMix(): Record<StepStatus, number> {
  return {
    pending: 0,
    running: 0,
    done: 0,
    error: 0,
    skipped: 0,
  };
}

export async function GET() {
  try {
    const registry = getRegistryStore();
    const agentRecords = await registry.getAgents();

    const platformNodeMix = emptyNodeMix();
    let totalSkills = 0;
    let totalDelegations = 0;
    let totalRuns = 0;
    let totalDone = 0;
    let totalError = 0;

    const agents: PerAgentAnalytics[] = await Promise.all(
      agentRecords.map(async (agent) => {
        const skills = await registry.listSkills(agent.suinsName);
        const delegations = agent.delegations ?? [];
        const runs = await listRuns(agent.slug);

        const nodeTypeMix = emptyNodeMix();
        const stepStatusMix = emptyStatusMix();
        let doneRuns = 0;
        let errorRuns = 0;
        let lastRunAt: string | null = null;

        for (const run of runs) {
          if (run.status === 'done') doneRuns += 1;
          else if (run.status === 'error') errorRuns += 1;

          if (!lastRunAt || run.createdAt > lastRunAt) {
            lastRunAt = run.createdAt;
          }

          for (const step of run.steps ?? []) {
            const t = step.type as NodeType;
            if (t in nodeTypeMix) {
              nodeTypeMix[t] += 1;
              platformNodeMix[t] += 1;
            }
            const s = step.status as StepStatus;
            if (s in stepStatusMix) stepStatusMix[s] += 1;
          }
        }

        const completed = doneRuns + errorRuns;
        const successRate = completed === 0 ? 0 : doneRuns / completed;

        const topSkills = skills
          .map((s) => ({
            name: s.name,
            resolutions: Number(s.resolutions ?? '0') || 0,
          }))
          .sort((a, b) => b.resolutions - a.resolutions)
          .slice(0, 5);

        totalSkills += skills.length;
        totalDelegations += delegations.length;
        totalRuns += runs.length;
        totalDone += doneRuns;
        totalError += errorRuns;

        return {
          slug: agent.slug,
          suinsName: agent.suinsName,
          network: agent.network,
          status: agent.status,
          skillCount: skills.length,
          delegationCount: delegations.length,
          runCount: runs.length,
          doneRuns,
          errorRuns,
          successRate,
          stepStatusMix,
          nodeTypeMix,
          topSkills,
          lastRunAt,
        };
      }),
    );

    // Most-active agents first (run count, then skill count).
    agents.sort(
      (a, b) => b.runCount - a.runCount || b.skillCount - a.skillCount,
    );

    const completedTotal = totalDone + totalError;
    const response: AnalyticsResponse = {
      totals: {
        agents: agentRecords.length,
        activeAgents: agentRecords.filter((a) => a.status === 'active').length,
        skills: totalSkills,
        delegations: totalDelegations,
        runs: totalRuns,
        doneRuns: totalDone,
        errorRuns: totalError,
        successRate: completedTotal === 0 ? 0 : totalDone / completedTotal,
      },
      nodeTypeMix: platformNodeMix,
      agents,
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(response);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'analytics failed' },
      { status: 500 },
    );
  }
}
