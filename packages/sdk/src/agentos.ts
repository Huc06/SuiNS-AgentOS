import type { ClientWithExtensions, CoreClient } from '@mysten/sui/client';

type ClientWithCoreApi = ClientWithExtensions<{ core: CoreClient }>;

import { AgentOSClient } from './client.js';

export interface AgentOSOptions<Name extends string = 'agentOS'> {
  name?: Name;
  harborApiKey?: string;
  packageId?: string;
  /** Forwarded to `AgentOSClient` — selects the Walrus upload path. Defaults to `"testnet"`. */
  network?: 'mainnet' | 'testnet' | 'devnet';
  /** Forwarded to `AgentOSClient` — see its docs. Required for mainnet Walrus uploads. */
  walrusMainnetUploaderFactory?: () => Promise<
    typeof import('./walrus-mainnet.js').createMainnetWalrusUploader
  >;
}

export function agentOS<const Name extends string = 'agentOS'>({
  name = 'agentOS' as Name,
  harborApiKey,
  packageId,
  network,
  walrusMainnetUploaderFactory,
}: AgentOSOptions<Name> = {}) {
  return {
    name,
    register: (client: ClientWithCoreApi) => {
      return new AgentOSClient({
        client,
        harborApiKey,
        packageId,
        network,
        walrusMainnetUploaderFactory,
      });
    },
  };
}

export type { AgentOSClient } from './client.js';
