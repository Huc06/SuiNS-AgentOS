import type { ClientWithCoreApi } from '@mysten/sui/experimental';

import { AgentOSClient } from './client.js';

export interface AgentOSOptions<Name extends string = 'agentOS'> {
  name?: Name;
  harborApiKey?: string;
  packageId?: string;
}

export function agentOS<const Name extends string = 'agentOS'>({
  name = 'agentOS' as Name,
  harborApiKey,
  packageId,
}: AgentOSOptions<Name> = {}) {
  return {
    name,
    register: (client: ClientWithCoreApi) => {
      return new AgentOSClient({ client, harborApiKey, packageId });
    },
  };
}

export type { AgentOSClient } from './client.js';
