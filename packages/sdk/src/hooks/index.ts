'use client';

import { useSuiClient } from '@mysten/dapp-kit';
import type { SuiClient } from '@mysten/sui/client';
import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { agentOS } from '../agentos.js';
import type { AgentOSClient } from '../client.js';
import type { AgentPassport, SkillDescriptor } from '../types.js';

type ExtendableSuiClient = SuiClient & {
  agentOS?: AgentOSClient;
  $extend: (registration: ReturnType<typeof agentOS>) => SuiClient & { agentOS: AgentOSClient };
};

function resolveAgentOSClient(client: unknown): AgentOSClient {
  const extendable = client as ExtendableSuiClient;

  if (extendable.agentOS) {
    return extendable.agentOS;
  }

  return extendable.$extend(agentOS()).agentOS;
}

export function useAgentOSClient(): AgentOSClient {
  const client = useSuiClient();
  return useMemo(() => resolveAgentOSClient(client), [client]);
}

export function useAgent(suinsName: string) {
  const sdk = useAgentOSClient();
  return useQuery<AgentPassport>({
    queryKey: ['agent', suinsName],
    queryFn: () => sdk.resolveAgent(suinsName),
    enabled: Boolean(suinsName),
  });
}

export function useSkills(agentName: string) {
  const sdk = useAgentOSClient();
  return useQuery<SkillDescriptor[]>({
    queryKey: ['skills', agentName],
    queryFn: () => sdk.listSkills(agentName),
    enabled: Boolean(agentName),
  });
}

export function useAgentWallet(agent: AgentPassport) {
  const sdk = useAgentOSClient();
  return useQuery({
    queryKey: ['wallet', agent.runtimeWallet],
    queryFn: async (): Promise<{ balance: bigint }> => {
      void sdk;
      throw new Error('Not implemented');
    },
  });
}
