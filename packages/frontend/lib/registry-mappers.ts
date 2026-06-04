import type { RegistryAgentRecord, RegistrySkillRecord } from '@agentos/sdk/node';

import type { AgentCardData } from '../components/dashboard/agent-card';
import type { AgentSkillRow } from './agent-types';

export function shortObjectId(id: string): string {
  if (id.length <= 12) return id;
  return `${id.slice(0, 6)}…${id.slice(-6)}`;
}

export function registryAgentToCard(
  agent: RegistryAgentRecord,
  skillCount: number,
): AgentCardData {
  return {
    slug: agent.slug,
    displayName: agent.suinsName.startsWith('@') ? agent.suinsName : `@${agent.slug}`,
    version: agent.passportVersion,
    network: agent.network,
    metric: skillCount === 0 ? 'No skills yet' : `${skillCount} skill${skillCount === 1 ? '' : 's'}`,
    trend: 'flat',
    icon: 'package',
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
