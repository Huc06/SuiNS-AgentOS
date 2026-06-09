type Network = "mainnet" | "testnet";

/**
 * Build a Walruscan explorer URL for a Walrus blob.
 * testnet -> https://walruscan.com/testnet/blob/{blobId}
 * mainnet -> https://walruscan.com/mainnet/blob/{blobId}
 */
export function walrusBlobUrl(network: Network, blobId: string): string {
  return `https://walruscan.com/${network}/blob/${blobId}`;
}

/**
 * Build a SuiVision explorer URL for a Sui object.
 * testnet -> https://testnet.suivision.xyz/object/{objectId}
 * mainnet -> https://suivision.xyz/object/{objectId}
 */
export function suiObjectUrl(network: Network, objectId: string): string {
  const host =
    network === "mainnet" ? "suivision.xyz" : "testnet.suivision.xyz";
  return `https://${host}/object/${objectId}`;
}
