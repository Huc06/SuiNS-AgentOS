import { loadConfig, type AgentOSConfig } from "./config.js";

const DEFAULT_BASE_URL = "https://api.testnet.harbor.walrus.xyz";

/**
 * Result of a manifest upload through the Harbor/Walrus pipeline. The
 * `manifestHash` is populated by the higher-level client layer (see
 * `AgentOSClient.uploadManifest`); `HarborClient.uploadBlob` itself only
 * returns the `blobId`.
 */
export interface HarborUploadResult {
  blobId: string;
  manifestHash: string;
}

/**
 * Options for constructing a {@link HarborClient}.
 */
export interface HarborClientOptions {
  /** Harbor API key, prefixed `hbr_`. */
  apiKey: string;
  /** Base URL for the Harbor API. Defaults to the testnet gateway. */
  baseUrl?: string;
}

/**
 * Minimal shape of the Harbor upload response. Harbor returns additional
 * fields (e.g. `size`) which we ignore.
 */
interface HarborUploadResponse {
  blobId: string;
}

/**
 * Thin REST client for the Harbor API, the Walrus storage gateway used to
 * store and retrieve skill manifest blobs. Every request carries a Bearer
 * token (`Authorization: Bearer hbr_...`).
 */
export class HarborClient {
  private readonly apiKey: string;
  private readonly baseUrl: string;

  constructor(options: HarborClientOptions) {
    this.apiKey = options.apiKey;
    // Trim a trailing slash so path concatenation stays predictable.
    this.baseUrl = (options.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  }

  /**
   * Upload a blob to a Walrus bucket via Harbor. POSTs the raw content to
   * `/api/v1/spaces/{spaceId}/buckets/{bucketId}/files` and returns the
   * resulting `blobId`.
   *
   * @throws if Harbor responds with a non-2xx status.
   */
  async uploadBlob(
    spaceId: string,
    bucketId: string,
    content: Uint8Array,
    filename: string,
  ): Promise<{ blobId: string }> {
    const url = `${this.baseUrl}/api/v1/spaces/${spaceId}/buckets/${bucketId}/files`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/octet-stream",
        "X-Filename": filename,
      },
      body: Buffer.from(content),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Walrus upload failed: ${response.status} ${body}`);
    }

    const result = (await response.json()) as HarborUploadResponse;
    return { blobId: result.blobId };
  }

  /**
   * Download a blob's raw bytes from Walrus via Harbor.
   * GETs `/api/v1/blobs/{blobId}` and returns the content as a `Uint8Array`.
   *
   * @throws "Manifest blob not found: {blobId}" if Harbor responds with 404.
   * @throws a descriptive error for other non-2xx responses.
   */
  async downloadBlob(blobId: string): Promise<Uint8Array> {
    const url = `${this.baseUrl}/api/v1/blobs/${blobId}`;

    const response = await fetch(url, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
    });

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

  /**
   * Resolve the Harbor API key from the environment or AgentOS config.
   *
   * Resolution order:
   * 1. `HARBOR_API_KEY` environment variable
   * 2. `harborApiKey` field in the provided (or loaded) AgentOSConfig
   *
   * @throws if no API key can be found in either source.
   */
  static getApiKey(config?: AgentOSConfig): string {
    const envKey = process.env.HARBOR_API_KEY?.trim();
    if (envKey) {
      return envKey;
    }

    const resolvedConfig = config ?? loadConfig();
    const configKey = resolvedConfig.harborApiKey?.trim();
    if (configKey) {
      return configKey;
    }

    throw new Error(
      "Harbor API key not configured. Set HARBOR_API_KEY or add harborApiKey to .agentos/config.json",
    );
  }
}
