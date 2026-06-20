import { NextResponse } from 'next/server';

import { getRegistry } from '../../../lib/registry-server';
import { registryAgentToCard } from '../../../lib/registry-mappers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const registry = getRegistry();
  const results = registry.searchAgents(q, 6);

  const cards = results.map((agent) => {
    const skills = registry.listSkills(agent.suinsName);
    return registryAgentToCard(agent, skills.length);
  });

  return NextResponse.json({ results: cards });
}
