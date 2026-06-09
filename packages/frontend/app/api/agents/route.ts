import { NextRequest, NextResponse } from 'next/server';

import { registryAgentToCard } from '../../../lib/registry-mappers';
import { getRegistry } from '../../../lib/registry-server';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const registry = getRegistry();
    const agents = registry.listAgents().map((agent) => {
      const skills = registry.listSkills(agent.suinsName);
      return registryAgentToCard(agent, skills.length);
    });
    return NextResponse.json({ agents });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'list agents failed' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  let body: {
    suinsName?: string;
    runtimeWallet?: string;
    network?: 'mainnet' | 'testnet';
    description?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { suinsName, runtimeWallet, network, description } = body;
  if (!suinsName?.trim() || !runtimeWallet?.trim()) {
    return NextResponse.json(
      { error: 'suinsName and runtimeWallet are required' },
      { status: 400 },
    );
  }

  try {
    const registry = getRegistry();
    const agent = registry.registerAgent({
      suinsName: suinsName.trim(),
      runtimeWallet: runtimeWallet.trim(),
      network: network ?? 'testnet',
      description: description?.trim(),
    });
    const skills = registry.listSkills(agent.suinsName);
    return NextResponse.json({
      agent,
      card: registryAgentToCard(agent, skills.length),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'register failed';
    const status = message.includes('already registered') ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
