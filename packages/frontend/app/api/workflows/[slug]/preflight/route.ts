import type { WorkflowGraph } from '@agentos/sdk/node';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getAgentosPackageId } from '../../../../../lib/enoki-config';
import { loadRootEnv } from '../../../../../lib/load-root-env';
import { computePreflight } from '../../../../../lib/preflight';
import { getRegistry } from '../../../../../lib/registry-server';

// Ensure repo-root .env is visible so the presence booleans are accurate.
loadRootEnv();

export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ slug: string }> };

const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum([
    'trigger',
    'walrus',
    'harbor',
    'sui',
    'memory',
    'import-agent',
    'call-sub-agent',
    'delegate',
    'attest',
  ]),
  label: z.string().min(1),
  params: z.record(z.unknown()).optional(),
});

const bodySchema = z.object({
  graph: z
    .object({
      nodes: z.array(nodeSchema).min(1),
      edges: z.array(z.object({ source: z.string(), target: z.string() })),
    })
    .optional(),
});

/**
 * The same default graph the run route uses, so a preflight with no body still
 * predicts the canonical Trigger -> Walrus -> {Harbor, Sui} -> Memory flow.
 */
function defaultGraph(
  passportId: string | undefined,
  packageId: string | undefined,
): WorkflowGraph {
  return {
    nodes: [
      { id: 'trigger', type: 'trigger', label: 'Trigger' },
      { id: 'walrus', type: 'walrus', label: 'Walrus' },
      { id: 'harbor', type: 'harbor', label: 'Harbor' },
      {
        id: 'sui',
        type: 'sui',
        label: 'Sui',
        params: {
          ...(passportId ? { passportId } : {}),
          ...(packageId ? { packageId } : {}),
        },
      },
      { id: 'memory', type: 'memory', label: 'Memory' },
    ],
    edges: [
      { source: 'trigger', target: 'walrus' },
      { source: 'walrus', target: 'harbor' },
      { source: 'walrus', target: 'sui' },
      { source: 'harbor', target: 'memory' },
      { source: 'sui', target: 'memory' },
    ],
  };
}

/**
 * Predict per-node run/skip/error for a workflow WITHOUT executing anything,
 * plus a presence-only env summary (booleans, never secret values). The canvas
 * fetches this before a run to warn about missing SUI_PRIVATE_KEY /
 * ENOKI_SECRET_KEY, mainnet-Walrus, missing passport, etc.
 */
export async function POST(request: NextRequest, context: RouteContext) {
  const { slug } = await context.params;
  const key = decodeURIComponent(slug).trim();
  if (!key) {
    return NextResponse.json({ error: 'slug is required' }, { status: 400 });
  }

  const raw = await request.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(raw ?? {});
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message ?? 'Invalid request body' },
      { status: 400 },
    );
  }

  const registry = getRegistry();
  const resolved = registry.resolveAgent(key);
  if (!resolved) {
    return NextResponse.json(
      { error: `Agent not found: ${key}` },
      { status: 404 },
    );
  }
  const agent = resolved.agent;
  const packageId = getAgentosPackageId();

  const graph =
    parsed.data.graph ?? defaultGraph(agent.passportId, packageId);

  const payload = computePreflight(graph, { passportId: agent.passportId });
  return NextResponse.json(payload);
}
