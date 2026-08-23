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

/**
 * Default epoch count for AgentOS-managed manifest uploads (skills, workflow
 * graphs). The public testnet publisher defaults to 1 epoch (~1 day on
 * testnet — see docs.wal.app/glossary: testnet epoch duration = 1 day), which
 * is far too short for a published skill/workflow to stay resolvable. 53
 * epochs (~53 days on testnet) comfortably outlives a demo/dev cycle without
 * requesting the network max (183 on testnet). Callers that want the blob to
 * live indefinitely can pass `permanent: true` instead/additionally.
 */
export const DEFAULT_WALRUS_EPOCHS = 53;

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
    blobObject?: {
      blobId?: string;
      storage?: { endEpoch?: number };
    };
  };
  alreadyCertified?: {
    blobId?: string;
    endEpoch?: number;
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
  ): Promise<{ blobId: string; endEpoch?: number }> {
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
    const endEpoch =
      result.newlyCreated?.blobObject?.storage?.endEpoch ??
      result.alreadyCertified?.endEpoch;
    return { blobId, endEpoch };
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

/** Public Upload Relay Mysten Labs operates for mainnet (charges a small tip
 * per upload — see https://upload-relay.mainnet.walrus.space/v1/tip-config).
 * There is no equivalent public relay needed on testnet: the plain HTTP
 * publisher/aggregator ({@link WalrusClient}) already works there for free. */
export const DEFAULT_MAINNET_UPLOAD_RELAY =
  "https://upload-relay.mainnet.walrus.space";

/** Minimal Sui client shape the mainnet Walrus path needs (a `$extend`-able
 * client, e.g. `SuiGrpcClient`). Kept structural to avoid a hard `@mysten/sui`
 * client-type coupling at this layer. */
export interface WalrusExtendableSuiClient {
  $extend: (
    ext: unknown,
  ) => { walrus: WalrusMainnetOperations } & Record<string, unknown>;
}

/** The subset of `@mysten/walrus`'s `WalrusClient` this module calls. Kept
 * structural (not imported directly) so `walrus.ts` — used by the
 * signer-agnostic parts of the SDK — has no hard `@mysten/walrus` import;
 * only {@link createMainnetWalrusUploader} (Node-only, see `node.ts`) does. */
export interface WalrusMainnetOperations {
  writeBlob(options: {
    blob: Uint8Array;
    deletable: boolean;
    epochs: number;
    signer: unknown;
  }): Promise<{ blobId: string; blobObject?: { storage?: { end_epoch?: number } } }>;
  readBlob(options: { blobId: string }): Promise<Uint8Array>;
}

export interface WalrusUploaderOptions {
  epochs?: number;
  permanent?: boolean;
}

/** Uniform upload/download surface both Walrus clients implement, so callers
 * can use whichever one {@link createWalrusUploader} selects without a
 * network-specific branch of their own. */
export interface WalrusUploader {
  uploadBlob(
    content: Uint8Array,
    options?: WalrusUploaderOptions,
  ): Promise<{ blobId: string; endEpoch?: number }>;
  downloadBlob(blobId: string): Promise<Uint8Array>;
}

/**
 * Mainnet-capable Walrus uploader backed by the official `@mysten/walrus`
 * client and Mysten's public mainnet Upload Relay — NOT the raw HTTP
 * publisher/aggregator {@link WalrusClient} uses (which has no public,
 * unauthenticated endpoint on mainnet; see the module docstring above).
 *
 * Unlike {@link WalrusClient}, uploading REQUIRES a signer: the relay pays no
 * gas/storage cost on the caller's behalf, so the underlying
 * `WalrusClient.writeBlob` call signs+submits the register/certify
 * transactions itself (and, per the relay's tip-config, sends it a small
 * per-upload tip).
 *
 * Constructed via {@link createMainnetWalrusUploader} (Node-only — pulls
 * `@mysten/walrus`'s WASM encoder), never instantiated directly from this
 * (signer-agnostic) module.
 */
export class WalrusUploadRelayClient implements WalrusUploader {
  #walrus: WalrusMainnetOperations;
  #signer?: unknown;

  constructor(walrus: WalrusMainnetOperations, signer?: unknown) {
    this.#walrus = walrus;
    this.#signer = signer;
  }

  async uploadBlob(
    content: Uint8Array,
    options: WalrusUploaderOptions = {},
  ): Promise<{ blobId: string; endEpoch?: number }> {
    if (!this.#signer) {
      throw new Error(
        "WalrusUploadRelayClient: a signer is required to upload on " +
          "mainnet (the Upload Relay needs one to pay gas and its tip) — " +
          "none was provided when this client was constructed.",
      );
    }
    const result = await this.#walrus.writeBlob({
      blob: content,
      // `permanent: true` (skill/workflow manifests that should outlive any
      // fixed epoch count) maps to `deletable: false`; otherwise deletable so
      // the object owner can reclaim storage rent later.
      deletable: !options.permanent,
      epochs: options.epochs ?? DEFAULT_WALRUS_EPOCHS,
      signer: this.#signer,
    });
    const endEpoch = result.blobObject?.storage?.end_epoch;
    return { blobId: result.blobId, ...(endEpoch !== undefined ? { endEpoch } : {}) };
  }

  async downloadBlob(blobId: string): Promise<Uint8Array> {
    return this.#walrus.readBlob({ blobId });
  }
}
