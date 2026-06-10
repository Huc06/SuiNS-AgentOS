/**
 * Walrus HTTP storage client (publisher + aggregator).
 *
 * Unlike the Harbor gateway (which requires per-bucket Seal-encryption, a
 * reserve→sign→finalize handshake, and a service key), the public Walrus
 * testnet publisher/aggregator expose a dead-simple unauthenticated HTTP API:
 *
 *   - Upload:   `PUT  {publisher}/v1/blobs[?epochs=N&permanent=true]`  (raw bytes)
 *   - Download: `GET  {aggregator}/v1/blobs/{blobId}`                  (raw bytes)
 *
 * This makes Walrus the default storage backend for skill manifests. The
 * Harbor client is kept in the codebase but is opt-in (see {@link HarborClient}).
 *
 * Note: there is NO public unauthenticated publisher on mainnet — the public
 * endpoints below are testnet only. For mainnet, run an authenticated publisher
 * or use the Walrus TypeScript SDK / Upload Relay.
 */

/** Default public Walrus testnet endpoints. */
export const DEFAULT_WALRUS_PUBLISHER =
  "https://publisher.walrus-testnet.walrus.space";
export const DEFAULT_WALRUS_AGGREGATOR =
  "https://aggregator.walrus-testnet.walrus.space";

export interface WalrusClientOptions {
  /** Publisher base URL (write). Defaults to the testnet publisher. */
  publisherUrl?: string;
  /** Aggregator base URL (read). Defaults to the testnet aggregator. */
  aggregatorUrl?: string;
}

export interface WalrusUploadOptions {
  /** Number of storage epochs to keep the blob. Defaults to publisher default (1). */
  epochs?: number;
  /** Store as a permanent blob instead of the default deletable blob. */
  permanent?: boolean;
}

/** Shape of the publisher store response (subset we rely on). */
interface WalrusStoreResponse {
  newlyCreated?: {
    blobObject?: { blobId?: string };
  };
  alreadyCertified?: {
    blobId?: string;
  };
}

/**
 * Thin REST client for the Walrus publisher/aggregator HTTP API.
 */
export class WalrusClient {
  private readonly publisherUrl: string;
  private readonly aggregatorUrl: string;

  constructor(options: WalrusClientOptions = {}) {
    this.publisherUrl = (
      options.publisherUrl ?? DEFAULT_WALRUS_PUBLISHER
    ).replace(/\/+$/, "");
    this.aggregatorUrl = (
      options.aggregatorUrl ?? DEFAULT_WALRUS_AGGREGATOR
    ).replace(/\/+$/, "");
  }

  /**
   * Store a blob on Walrus via the publisher. Returns the resulting `blobId`
   * (works whether the blob was newly created or already certified).
   *
   * @throws if the publisher responds with a non-2xx status or no blobId.
   */
  async uploadBlob(
    content: Uint8Array,
    options: WalrusUploadOptions = {},
  ): Promise<{ blobId: string }> {
    const params = new URLSearchParams();
    if (options.epochs !== undefined) {
      params.set("epochs", String(options.epochs));
    }
    if (options.permanent) {
      params.set("permanent", "true");
    }
    const query = params.toString();
    const url = `${this.publisherUrl}/v1/blobs${query ? `?${query}` : ""}`;

    const response = await fetch(url, {
      method: "PUT",
      headers: { "Content-Type": "application/octet-stream" },
      body: Buffer.from(content),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Walrus upload failed: ${response.status} ${body}`);
    }

    const result = (await response.json()) as WalrusStoreResponse;
    const blobId =
      result.newlyCreated?.blobObject?.blobId ??
      result.alreadyCertified?.blobId;
    if (!blobId) {
      throw new Error(
        `Walrus upload failed: response missing blobId (${JSON.stringify(result)})`,
      );
    }
    return { blobId };
  }

  /**
   * Read a blob's raw bytes from Walrus via the aggregator.
   *
   * @throws "Manifest blob not found: {blobId}" on 404, or a descriptive error
   *   for other non-2xx responses.
   */
  async downloadBlob(blobId: string): Promise<Uint8Array> {
    const url = `${this.aggregatorUrl}/v1/blobs/${encodeURIComponent(blobId)}`;

    const response = await fetch(url, { method: "GET" });

    if (response.status === 404) {
      throw new Error(`Manifest blob not found: ${blobId}`);
    }
    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Walrus download failed: ${response.status} ${body}`);
    }

    const buffer = await response.arrayBuffer();
    return new Uint8Array(buffer);
  }
}
