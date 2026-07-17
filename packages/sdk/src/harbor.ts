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
  /** Walrus storage end epoch for the manifest blob (Walrus backend only; undefined for Harbor). */
  endEpoch?: number;
}

/**
 * Result of a Harbor file upload: the Harbor `fileId` (always present) and the
 * underlying Walrus `blobId` (populated once the async upload job certifies the
 * blob; may still be empty if we returned before completion). The default
 * {@link HarborClient.uploadBlob} polls the upload job to completion, so both
 * are normally present.
 */
export interface HarborFileUploadResult {
  /** Harbor file id (a uuid). Stable immediately after the 202 accept. */
  fileId: string;
  /** Underlying Walrus blob id, once the upload job certifies it. */
  blobId: string;
  /** Terminal/last-seen Harbor upload job state. */
  state?: string;
}

export interface HarborFileUploadOptions {
  /** Original plaintext MIME used by Harbor after private Seal decryption. */
  contentType?: string;
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
 * Minimal shape of a Harbor `FileSummary` (the `data` envelope of an upload /
 * file-metadata response). Harbor returns additional fields (e.g. `size`,
 * `created_at`) which we ignore. `blob_id` is null until the async upload job
 * certifies the Walrus blob.
 */
interface HarborFileSummary {
  id: string;
  blob_id?: string | null;
  status?: string;
  name?: string;
}

/** The `{ data: FileSummary }` envelope Harbor wraps single-object responses in. */
interface HarborFileEnvelope {
  data?: HarborFileSummary;
}

/**
 * Shape of the Harbor upload-job status response
 * (`GET …/files/{fileId}/status`). `state` is the job lifecycle; `completed`
 * means the Walrus blob is certified.
 */
interface HarborUploadError {
  code?: string;
  message?: string;
  http_status?: number;
}

interface HarborUploadStatus {
  /** Legacy/root-level shape retained for backwards compatibility. */
  state?: "queued" | "active" | "completed" | "failed" | string;
  progress?: number;
  error?: HarborUploadError;
  /**
   * Harbor's current response envelope: `{ data: { state, progress, error } }`.
   * `blob_id` can still be present on a completed response, so preserve the
   * file-summary fields here as well.
   */
  data?: HarborFileSummary & {
    state?: "queued" | "active" | "completed" | "failed" | string;
    progress?: number;
    error?: HarborUploadError;
  };
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
   * Upload a blob to a bucket via Harbor and return the underlying Walrus
   * `blobId` plus the Harbor `fileId`.
   *
   * Harbor's real upload endpoint is `POST /api/v1/buckets/{bucketId}/files`
   * with a `multipart/form-data` body (field name `file`). It is **async**: the
   * POST returns `202 { data: FileSummary }` with the file `id` immediately, but
   * `blob_id` is null until the background job certifies the Walrus blob. We
   * therefore poll `…/files/{fileId}/status` until the job reports `completed`
   * (then read back `blob_id`), so callers get a real Walrus blob id.
   *
   * The legacy first argument is the `spaceId`; it is accepted for backwards
   * compatibility but the real path is keyed by bucket id only.
   *
   * @throws "Harbor upload failed: …" if Harbor responds with a non-2xx status
   *   or the upload job fails. (Distinct from "Walrus upload failed:" so a
   *   Harbor-API failure is never mislabelled as a public-Walrus failure.)
   */
  async uploadBlob(
    spaceId: string,
    bucketId: string,
    content: Uint8Array,
    filename: string,
    pollOptions: { attempts?: number; intervalMs?: number } = {},
    uploadOptions: HarborFileUploadOptions = {},
  ): Promise<HarborFileUploadResult> {
    // Harbor keys the upload path by bucket UUID. HARBOR_BUCKET_ID must be a
    // UUID; the list-buckets endpoint is not stable, so we require UUID directly.
    const url = `${this.baseUrl}/api/v1/buckets/${bucketId}/files`;

    const form = new FormData();
    // Copy into a standalone ArrayBuffer-backed view so Blob never sees a
    // SharedArrayBuffer (which `BlobPart` does not accept under strict TS).
    const bytes = new Uint8Array(content.length);
    bytes.set(content);
    form.append(
      "file",
      new Blob([bytes], {
        type: uploadOptions.contentType ?? "application/octet-stream",
      }),
      filename,
    );

    const response = await fetch(url, {
      method: "POST",
      // NOTE: do NOT set Content-Type — fetch derives the multipart boundary.
      headers: { Authorization: `Bearer ${this.apiKey}` },
      body: form,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Harbor upload failed: ${response.status} ${body}`);
    }

    const summary = ((await response.json()) as HarborFileEnvelope).data;
    const fileId = summary?.id;
    if (!fileId) {
      throw new Error(
        `Harbor upload failed: response missing file id (${JSON.stringify(summary ?? {})})`,
      );
    }

    // Fast path: the blob id is already present (sync/cached upload).
    if (summary.blob_id) {
      return { fileId, blobId: summary.blob_id, state: summary.status };
    }

    // Async path: poll the upload job to completion, then read back blob_id.
    const { state, blobId } = await this.waitForUpload(
      bucketId,
      fileId,
      pollOptions,
    );
    return { fileId, blobId: blobId ?? "", state };
  }

  /**
   * Poll a Harbor upload job until it reaches a terminal state. On `completed`
   * we re-read the file metadata to surface the certified Walrus `blob_id`.
   *
   * @throws "Harbor upload failed: …" if the job reports `failed`.
   */
  private async waitForUpload(
    bucketId: string,
    fileId: string,
    options: { attempts?: number; intervalMs?: number } = {},
  ): Promise<{ state?: string; blobId?: string }> {
    const attempts = options.attempts ?? 30;
    const intervalMs = options.intervalMs ?? 1000;
    const statusUrl = `${this.baseUrl}/api/v1/buckets/${bucketId}/files/${fileId}/status`;

    for (let i = 0; i < attempts; i += 1) {
      const res = await fetch(statusUrl, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Harbor upload failed: ${res.status} ${body}`);
      }
      const status = (await res.json()) as HarborUploadStatus;
      // Current Harbor responses wrap job fields in `data`; accept the legacy
      // root-level form too so callers do not silently time out during rollout.
      const nested = status.data;
      const state = nested?.state ?? status.state;
      if (state === "completed") {
        const blobId =
          nested?.blob_id ?? (await this.getFileBlobId(bucketId, fileId));
        return { state, ...(blobId ? { blobId } : {}) };
      }
      if (state === "failed") {
        const error = nested?.error ?? status.error;
        const detail = error
          ? `: ${error.code ?? "unknown"}${error.message ? `: ${error.message}` : ""}`
          : "";
        throw new Error(
          `Harbor upload failed: job ${fileId} reported failed${detail}`,
        );
      }
      // queued / active → wait and retry.
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    // Timed out waiting; return without a blob id (caller decides what to do).
    return { state: "active" };
  }

  /** Read a file's metadata and return its certified Walrus `blob_id` (or undefined). */
  private async getFileBlobId(
    bucketId: string,
    fileId: string,
  ): Promise<string | undefined> {
    const url = `${this.baseUrl}/api/v1/buckets/${bucketId}/files/${fileId}`;
    try {
      const res = await fetch(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(
          `[Harbor] getFileBlobId failed: ${res.status} ${body}`,
        );
        return undefined;
      }
      const summary = ((await res.json()) as HarborFileEnvelope).data;
      const blobId = summary?.blob_id;
      if (!blobId) {
        console.warn(
          `[Harbor] getFileBlobId returned no blob_id: fileId=${fileId}, response=${JSON.stringify(summary)}`,
        );
      }
      return blobId ?? undefined;
    } catch (err) {
      console.error(`[Harbor] getFileBlobId error:`, err);
      return undefined;
    }
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
      throw new Error(`Harbor download failed: ${response.status} ${body}`);
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
