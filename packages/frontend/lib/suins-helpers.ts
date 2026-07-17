import { SuinsClient, mainPackage } from '@mysten/suins';
import { isValidSuiNSName } from '@mysten/sui/utils';

/** dapp-kit client is compatible at runtime; SuinsClient types expect SuiClient. */
type SuinsRpcClient = ConstructorParameters<typeof SuinsClient>[0]['client'];

import type { SuiNetworkName } from './enoki-config';

export type SuinsVerification = {
  name: string;
  registered: boolean;
  ownedByWallet: boolean;
  expired: boolean;
  targetAddress: string | null;
  runtimeWallet: string;
  targetMatchesRuntime: boolean;
  nftId: string | null;
  expirationTimestampMs: number | null;
  /** Present only when the client could not complete an on-chain lookup. */
  lookupError?: string;
};

export function normalizeSuinsInput(raw: string): string {
  const name = raw.trim().toLowerCase().replace(/^@/, '');
  if (!name) return '';
  if (name.endsWith('.sui')) return name;
  return `${name}.sui`;
}

export function isValidSuinsNameInput(raw: string): boolean {
  const name = normalizeSuinsInput(raw);
  return name.length > 4 && isValidSuiNSName(name);
}

export function createSuinsClient(client: SuinsRpcClient, network: SuiNetworkName): SuinsClient {
  if (network === 'mainnet') {
    return new SuinsClient({ client, network: 'mainnet' });
  }
  return new SuinsClient({ client, network: 'testnet' });
}

function packageIdV1ForNetwork(network: SuiNetworkName): string {
  return network === 'mainnet' ? mainPackage.mainnet.packageIdV1 : mainPackage.testnet.packageIdV1;
}

function extractDomainFromNftFields(fields: Record<string, unknown>): string | null {
  for (const key of ['domain_name', 'name', 'domain']) {
    const value = fields[key];
    if (typeof value !== 'string' || !value.trim()) continue;
    const normalized = normalizeSuinsInput(value);
    if (isValidSuiNSName(normalized)) return normalized;
  }
  return null;
}

/** Names from SuiNS registration NFTs owned by the connected wallet. */
export async function listOwnedSuinsNames(
  client: SuinsRpcClient,
  owner: string,
  network: SuiNetworkName,
): Promise<string[]> {
  const packageV1 = packageIdV1ForNetwork(network);
  const names = new Set<string>();
  let cursor: string | null | undefined = null;

  do {
    const page = await client.getOwnedObjects({
      owner,
      cursor,
      options: { showContent: true, showType: true },
    });

    for (const item of page.data) {
      const type = item.data?.type ?? '';
      if (!type.includes(packageV1)) continue;
      const content = item.data?.content;
      if (!content || content.dataType !== 'moveObject' || !('fields' in content)) continue;
      const domain = extractDomainFromNftFields(content.fields as Record<string, unknown>);
      if (domain) names.add(domain);
    }

    cursor = page.hasNextPage ? page.nextCursor : null;
  } while (cursor);

  const reverse = await client.resolveNameServiceNames({
    address: owner,
    format: 'dot',
  });
  for (const name of reverse.data) {
    if (isValidSuiNSName(name)) names.add(name);
  }

  return [...names].sort();
}

export async function verifySuinsForWallet(options: {
  client: SuinsRpcClient;
  network: SuiNetworkName;
  name: string;
  walletAddress: string;
  runtimeWallet: string;
}): Promise<SuinsVerification> {
  const name = normalizeSuinsInput(options.name);
  const suins = createSuinsClient(options.client, options.network);
  const record = await suins.getNameRecord(name);

  if (!record) {
    return {
      name,
      registered: false,
      ownedByWallet: false,
      expired: false,
      targetAddress: null,
      runtimeWallet: options.runtimeWallet,
      targetMatchesRuntime: false,
      nftId: null,
      expirationTimestampMs: null,
    };
  }

  const now = Date.now();
  const expired = record.expirationTimestampMs <= now;
  const targetAddress = record.targetAddress || null;
  const targetMatchesRuntime =
    Boolean(targetAddress) &&
    targetAddress!.toLowerCase() === options.runtimeWallet.toLowerCase();

  let ownedByWallet = false;
  if (record.nftId) {
    try {
      const object = await options.client.getObject({
        id: record.nftId,
        options: { showOwner: true },
      });
      const owner = object.data?.owner;
      if (owner && typeof owner === 'object' && 'AddressOwner' in owner) {
        ownedByWallet =
          owner.AddressOwner.toLowerCase() === options.walletAddress.toLowerCase();
      }
    } catch {
      ownedByWallet = false;
    }
  }

  return {
    name,
    registered: true,
    ownedByWallet,
    expired,
    targetAddress,
    runtimeWallet: options.runtimeWallet,
    targetMatchesRuntime,
    nftId: record.nftId ?? null,
    expirationTimestampMs: record.expirationTimestampMs ?? null,
  };
}

export function suinsStatusLabel(verification: SuinsVerification | null): string {
  if (!verification) return '';
  if (verification.lookupError) {
    return `Could not check SuiNS on-chain: ${verification.lookupError}`;
  }
  if (!verification.registered) return 'Name is not registered on-chain — get it on suins.io first.';
  if (verification.expired) return 'This name has expired. Renew on suins.io.';
  if (!verification.ownedByWallet) {
    return 'This name is not owned by your connected wallet.';
  }
  if (!verification.targetMatchesRuntime) {
    return verification.targetAddress
      ? `Target is ${verification.targetAddress.slice(0, 10)}… — will bind to runtime on submit.`
      : 'No target address set — will bind to your runtime wallet on submit.';
  }
  return 'SuiNS verified — name owned by you and bound to runtime wallet.';
}
