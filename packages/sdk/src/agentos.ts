import type { ClientWithCoreApi } from '@mysten/sui/experimental';

import { AgentOSClient } from './client.js';

export interface AgentOSOptions<Name extends string = 'agentOS'> {
  name?: Name;
  harborApiKey?: string;
}

export function agentOS<const Name extends string = 'agentOS'>({
  name = 'agentOS' as Name,
  harborApiKey,
}: AgentOSOptions<Name> = {}) {
  return {
    name,
    register: (client: ClientWithCoreApi) => {
      return new AgentOSClient({ client, harborApiKey });
    },
  };
}

export type { AgentOSClient } from './client.js';
