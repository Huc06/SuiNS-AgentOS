import type { SuiNetworkName } from "./enoki-config";

function explorerNetwork(network: SuiNetworkName): "mainnet" | "testnet" {
  return network === "mainnet" ? "mainnet" : "testnet";
}

export function explorerTxUrl(network: SuiNetworkName, digest: string): string {
  return `https://suiscan.xyz/${explorerNetwork(network)}/tx/${digest}`;
}

export function explorerObjectUrl(
  network: SuiNetworkName,
  objectId: string,
): string {
  return `https://suiscan.xyz/${explorerNetwork(network)}/object/${objectId}`;
}

/** Build a shareable agent profile URL. */
export function agentProfileShareUrl(slug: string): string {
  const base = typeof window !== "undefined" ? window.location.origin : "";
  return `${base}/agent/${encodeURIComponent(slug)}`;
}
