import type { ClientWithExtensions, CoreClient } from '@mysten/sui/client';
import { SuiGrpcClient } from '@mysten/sui/grpc';

type ClientWithCoreApi = ClientWithExtensions<{ core: CoreClient }>;
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { agentOS, type AgentOSClient } from '@agentos-sui/sdk';
import { loadConfig, LocalRegistry, resolvePackageId, resolveRegistryPath } from '@agentos-sui/sdk/node';

export function createCliContext(cwd = process.cwd()) {
  const config = loadConfig(cwd);
  const registryPath = resolveRegistryPath(config, cwd);
  const registry = LocalRegistry.open(registryPath);
  const network = config.network ?? 'testnet';
  const grpcNetwork = network === 'mainnet' ? 'mainnet' : 'testnet';
  const rpcUrl = config.rpcUrl ?? `https://fullnode.${grpcNetwork}.sui.io:443`;
  const suiClient = new SuiGrpcClient({ network: grpcNetwork, baseUrl: rpcUrl });
  const agentos = agentOS({ packageId: resolvePackageId(config) }).register(
    suiClient as unknown as ClientWithCoreApi,
  );

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
