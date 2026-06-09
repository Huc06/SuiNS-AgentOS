'use client';

import type { ResolveAgentResponse } from '@agentos/sdk/node';

import type { AgentSkillRow } from './agent-types';
import { registrySkillToRow } from './registry-mappers';

export async function fetchAgentSkills(slug: string): Promise<AgentSkillRow[] | null> {
  const res = await fetch(`/api/resolve?name=${encodeURIComponent(slug)}`, {
    cache: 'no-store',
  });
  if (!res.ok) return null;
  const data = (await res.json()) as ResolveAgentResponse;
  return data.skills.map(registrySkillToRow);
}
