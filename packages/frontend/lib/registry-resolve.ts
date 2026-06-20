import type { ResolveAgentResponse } from '@agentos/sdk/node';

import type { AgentCardData } from '../components/dashboard/agent-card';
import type { AgentSkillRow } from './agent-types';
import { registryAgentToCard, registrySkillToRow } from './registry-mappers';
import { getRegistryStore } from './registry-server';

export async function resolveAgentBySlug(
  slug: string,
): Promise<ResolveAgentResponse | null> {
  const store = getRegistryStore();
  return store.resolveAgent(slug);
}

export async function resolveAgentPageData(slug: string): Promise<{
  card: AgentCardData;
  skills: AgentSkillRow[];
  resolved: ResolveAgentResponse;
} | null> {
  const resolved = await resolveAgentBySlug(slug);
  if (!resolved) return null;

  return {
    resolved,
    card: registryAgentToCard(resolved.agent, resolved.skills.length),
    skills: resolved.skills.map(registrySkillToRow),
  };
}
