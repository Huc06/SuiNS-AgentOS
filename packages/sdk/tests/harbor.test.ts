import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HarborClient } from "../src/harbor.js";

// A bucket UUID — uploadBlob resolves non-UUID names to a UUID first (extra
// list-buckets fetch), so the upload-flow tests pass a UUID to exercise the
// upload path directly. Name resolution has its own dedicated test below.
const BUCKET = "00000000-0000-4000-8000-000000000001";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("HarborClient", () => {
  let client: HarborClient;

  beforeEach(() => {
    client = new HarborClient({
      apiKey: "hbr_test_key_123",
      baseUrl: "https://api.testnet.harbor.walrus.xyz",
    });
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("constructor", () => {
    it("uses default base URL when none provided", () => {
      const c = new HarborClient({ apiKey: "hbr_key" });
      // Verify it can be instantiated without error
      expect(c).toBeInstanceOf(HarborClient);
    });

    it("trims trailing slashes from base URL", async () => {
      const c = new HarborClient({
        apiKey: "hbr_key",
        baseUrl: "https://example.com///",
      });
      // Sync path: blob_id already present → no status polling.
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: { id: "file1", blob_id: "blob123" } }),
      });

      await c.uploadBlob("space1", BUCKET, new Uint8Array([1]), "f.json");

      expect(mockFetch).toHaveBeenCalledWith(
        `https://example.com/api/v1/buckets/${BUCKET}/files`,
        expect.anything(),
      );
    });
  });

  describe("uploadBlob", () => {
    it("POSTs multipart to the bucket files endpoint with Bearer auth and returns the blobId", async () => {
      // 202 with blob_id already present (no async polling needed).
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: { id: "file-9", blob_id: "abc123", status: "completed" },
        }),
      });

      const content = new TextEncoder().encode('{"name":"test"}');
      const result = await client.uploadBlob(
        "space-1",
        BUCKET,
        content,
        "manifest.json",
      );

      expect(result).toMatchObject({ blobId: "abc123", fileId: "file-9" });
      // The real Harbor path is keyed by bucket id only (no space segment).
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        `https://api.testnet.harbor.walrus.xyz/api/v1/buckets/${BUCKET}/files`,
      );
      expect(init.method).toBe("POST");
      // Bearer auth, and NO Content-Type (fetch derives the multipart boundary).
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe("Bearer hbr_test_key_123");
      expect(headers["Content-Type"]).toBeUndefined();
      // The body is multipart/form-data carrying the file.
      expect(init.body).toBeInstanceOf(FormData);
      expect((init.body as FormData).has("file")).toBe(true);
    });

    it("polls the upload status job for an async upload and reads back blob_id", async () => {
      mockFetch
        // POST → 202 accepted, blob_id null (async).
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            data: { id: "file-async", blob_id: null, status: "queued" },
          }),
        })
        // status poll 1 → still active.
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ state: "active", progress: 0.5 }),
        })
        // status poll 2 → completed, blob_id surfaced.
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            state: "completed",
            data: { id: "file-async", blob_id: "WAL_DONE" },
          }),
        });

      const result = await client.uploadBlob(
        "space",
        BUCKET,
        new Uint8Array([1, 2, 3]),
        "f.seal",
        { attempts: 5, intervalMs: 0 },
      );

      expect(result).toMatchObject({
        fileId: "file-async",
        blobId: "WAL_DONE",
        state: "completed",
      });
      // POST + 2 status polls.
      expect(mockFetch).toHaveBeenCalledTimes(3);
      const statusUrl = (mockFetch.mock.calls[1] as [string])[0];
      expect(statusUrl).toBe(
        `https://api.testnet.harbor.walrus.xyz/api/v1/buckets/${BUCKET}/files/file-async/status`,
      );
    });

    it("throws a HARBOR-labelled error on a non-2xx upload (404) — not 'Walrus upload failed'", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      await expect(
        client.uploadBlob("s", BUCKET, new Uint8Array([1]), "f.json"),
      ).rejects.toThrow("Harbor upload failed: 404 Not Found");
    });

    it("throws a HARBOR-labelled error on auth failure (403)", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "Forbidden: invalid API key",
      });

      await expect(
        client.uploadBlob("s", BUCKET, new Uint8Array([1]), "f.json"),
      ).rejects.toThrow("Harbor upload failed: 403 Forbidden: invalid API key");
    });

    it("throws a HARBOR-labelled error when the upload job reports failed", async () => {
      mockFetch
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: { id: "f1", blob_id: null } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ state: "failed" }),
        });

      await expect(
        client.uploadBlob("s", BUCKET, new Uint8Array([1]), "f.json", {
          attempts: 3,
          intervalMs: 0,
        }),
      ).rejects.toThrow("Harbor upload failed: job f1 reported failed");
    });
  });

  describe("downloadBlob", () => {
    it("GETs blob content and returns Uint8Array", async () => {
      const expectedBytes = new Uint8Array([10, 20, 30]);
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => expectedBytes.buffer,
      });

      const result = await client.downloadBlob("blob-xyz");

      expect(result).toBeInstanceOf(Uint8Array);
      expect(Array.from(result)).toEqual([10, 20, 30]);
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.testnet.harbor.walrus.xyz/api/v1/blobs/blob-xyz",
        expect.objectContaining({
          method: "GET",
          headers: expect.objectContaining({
            Authorization: "Bearer hbr_test_key_123",
          }),
        }),
      );
    });

    it("throws specific error on 404", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 404,
        text: async () => "Not Found",
      });

      await expect(client.downloadBlob("missing-blob")).rejects.toThrow(
        "Manifest blob not found: missing-blob",
      );
    });

    it("throws generic error on other non-2xx", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        text: async () => "Bad Gateway",
      });

      await expect(client.downloadBlob("some-blob")).rejects.toThrow(
        "Harbor download failed: 502 Bad Gateway",
      );
    });
  });

  describe("getApiKey", () => {
    it("returns HARBOR_API_KEY from environment", () => {
      vi.stubEnv("HARBOR_API_KEY", "hbr_env_key");

      const key = HarborClient.getApiKey();
      expect(key).toBe("hbr_env_key");
    });

    it("returns key from config when env is not set", () => {
      vi.stubEnv("HARBOR_API_KEY", "");

      const key = HarborClient.getApiKey({
        network: "testnet",
        harborApiKey: "hbr_config_key",
      });
      expect(key).toBe("hbr_config_key");
    });

    it("prefers env over config", () => {
      vi.stubEnv("HARBOR_API_KEY", "hbr_from_env");

      const key = HarborClient.getApiKey({
        network: "testnet",
        harborApiKey: "hbr_from_config",
      });
      expect(key).toBe("hbr_from_env");
    });

    it("throws when neither env nor config has a key", () => {
      vi.stubEnv("HARBOR_API_KEY", "");

      expect(() => HarborClient.getApiKey({ network: "testnet" })).toThrow(
        "Harbor API key not configured. Set HARBOR_API_KEY or add harborApiKey to .agentos/config.json",
      );
    });

    it("trims whitespace from env key", () => {
      vi.stubEnv("HARBOR_API_KEY", "  hbr_trimmed  ");

      const key = HarborClient.getApiKey();
      expect(key).toBe("hbr_trimmed");
    });
  });
});
