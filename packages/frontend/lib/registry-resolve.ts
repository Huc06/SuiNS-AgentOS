import type { ResolveAgentResponse } from '@agentos/sdk/node';

import type { AgentCardData } from '../components/dashboard/agent-card';
import type { AgentSkillRow } from './agent-types';
import { registryAgentToCard, registrySkillToRow } from './registry-mappers';
import { getRegistry } from './registry-server';

export function resolveAgentBySlug(slug: string): ResolveAgentResponse | null {
  const registry = getRegistry();
  return registry.resolveAgent(slug);
}

export function resolveAgentPageData(slug: string): {
  card: AgentCardData;
  skills: AgentSkillRow[];
  resolved: ResolveAgentResponse;
} | null {
  const resolved = resolveAgentBySlug(slug);
  if (!resolved) return null;

  return {
    resolved,
    card: registryAgentToCard(resolved.agent, resolved.skills.length),
    skills: resolved.skills.map(registrySkillToRow),
  };
}
