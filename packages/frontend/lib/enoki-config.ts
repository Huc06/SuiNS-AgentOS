export type SuiNetworkName = 'testnet' | 'mainnet' | 'devnet';

export function getPublicEnokiApiKey(): string | undefined {
  const key = process.env.NEXT_PUBLIC_ENOKI_API_KEY?.trim();
  return key || undefined;
}

export function getSuiNetwork(): SuiNetworkName {
  const n = process.env.NEXT_PUBLIC_SUI_NETWORK?.trim();
  if (n === 'mainnet' || n === 'devnet') return n;
  return 'testnet';
}

export function getAgentosPackageId(): string | undefined {
  const id =
    process.env.NEXT_PUBLIC_AGENTOS_PACKAGE_ID?.trim() ||
    process.env.AGENTOS_PACKAGE_ID?.trim();
  return id || undefined;
}

export function isEnokiConfigured(): boolean {
  return Boolean(getPublicEnokiApiKey());
}

/** Client flag: attempt Enoki sponsor flow (server still needs ENOKI_SECRET_KEY). */
export function isEnokiSponsorEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ENOKI_SPONSOR === 'true' && isEnokiConfigured();
}
