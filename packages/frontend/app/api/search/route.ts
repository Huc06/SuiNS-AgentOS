import { NextResponse } from 'next/server';

import { getRegistryStore } from '../../../lib/registry-server';
import { registryAgentToCard } from '../../../lib/registry-mappers';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get('q')?.trim() ?? '';

  if (!q) {
    return NextResponse.json({ results: [] });
  }

  const registry = getRegistryStore();
  const results = await registry.searchAgents(q, 6);

  const cards = await Promise.all(
    results.map(async (agent) => {
      const skills = await registry.listSkills(agent.suinsName);
      return registryAgentToCard(agent, skills.length);
    }),
  );

  return NextResponse.json({ results: cards });
}
