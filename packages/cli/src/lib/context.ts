import type { ClientWithCoreApi } from '@mysten/sui/experimental';
import { getFullnodeUrl, SuiClient } from '@mysten/sui/client';
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { agentOS, type AgentOSClient } from '@agentos/sdk';
import { loadConfig, LocalRegistry, resolveRegistryPath } from '@agentos/sdk/node';

export function createCliContext(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const registryPath = resolveRegistryPath(config, cwd);
  const registry = LocalRegistry.open(registryPath);
  const network = config.network ?? 'testnet';
  const rpcUrl = config.rpcUrl ?? getFullnodeUrl(network);
  const suiClient = new SuiClient({ url: rpcUrl });
  const agentos = agentOS().register(suiClient as unknown as ClientWithCoreApi);

  return {
    config,
    cwd,
    registryPath,
    registry,
    network,
    rpcUrl,
    suiClient,
    agentos,
    getSigner: () => {
      const secret = process.env.SUI_PRIVATE_KEY ?? process.env.AGENTOS_PRIVATE_KEY;
      if (!secret) return null;
      return Ed25519Keypair.fromSecretKey(secret);
    },
  };
}

export type CliContext = ReturnType<typeof createCliContext>;
