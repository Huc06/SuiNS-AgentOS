import type { RegistryAgentRecord } from '@agentos/sdk/node';

import type { AgentCardData } from '../components/dashboard/agent-card';

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
