import { NextResponse } from 'next/server';

import { getRegistryStore } from '../../../lib/registry-server';

/**
 * GET /api/delegations?agent=<slug>
 * Returns delegation records for an agent from the registry.
 *
 * GET /api/delegations?all=1
 * Returns every parent agent (slug, name, network, status) together with its
 * granted delegations — the read-only feed the Delegations graph page consumes.
 *
 * POST /api/delegations
 * Body: { agentSlug, delegation: DelegationRecord }
 * Persists a delegation record to the registry.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const wantsAll = searchParams.get('all') !== null;
  const agentSlug = searchParams.get('agent')?.trim();

  const registry = getRegistryStore();

  if (wantsAll) {
    const agents = await registry.getAgents();
    const parents = agents.map((a) => ({
      slug: a.slug,
      suinsName: a.suinsName,
      network: a.network,
      status: a.status,
      delegations: a.delegations ?? [],
    }));
    return NextResponse.json({ agents: parents });
  }

  if (!agentSlug) {
    return NextResponse.json({ delegations: [] });
  }

  const delegations = await registry.listDelegations(agentSlug);
  return NextResponse.json({ delegations });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    agentSlug?: string;
    delegation?: {
      childAgent: string;
      childName: string;
      allowedSkills: string[];
      allowedCapabilities: string[];
      spendLimit: string;
      spent: string;
      expiryMs: string;
      revoked: boolean;
      capId?: string;
      createdAt: string;
    };
  };

  if (!body.agentSlug || !body.delegation) {
    return NextResponse.json(
      { error: 'Missing agentSlug or delegation' },
      { status: 400 },
    );
  }

  try {
    const registry = getRegistryStore();
    await registry.addDelegation(body.agentSlug, body.delegation);
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to save delegation' },
      { status: 500 },
    );
  }
}
