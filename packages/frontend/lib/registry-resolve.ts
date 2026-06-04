import type { RegistrySkillRecord, ResolveAgentResponse } from '@agentos/sdk/node';
import { shortObjectId } from '@agentos/sdk/node';

import type { AgentCardData } from '../components/dashboard/agent-card';
import type { AgentSkillRow } from './agent-types';
import { registryAgentToCard } from './agent-card-mapper';
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

export function registrySkillToRow(skill: RegistrySkillRecord): AgentSkillRow {
  return {
    id: skill.skillId,
    name: skill.name,
    mvrPackage: skill.mvrPackage,
    network: skill.network,
    version: skill.version,
    objectId: shortObjectId(skill.objectId),
    status: skill.status,
    resolutions: skill.resolutions,
    lastUpdated: skill.lastUpdated,
    icon: skill.icon,
  };
}
