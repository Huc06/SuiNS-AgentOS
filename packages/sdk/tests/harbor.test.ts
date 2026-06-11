import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { HarborClient } from "../src/harbor.js";

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
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ blobId: "blob123" }),
      });

      await c.uploadBlob("space1", "bucket1", new Uint8Array([1]), "f.json");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://example.com/api/v1/spaces/space1/buckets/bucket1/files",
        expect.anything(),
      );
    });
  });

  describe("uploadBlob", () => {
    it("POSTs to correct endpoint with Bearer auth and returns blobId", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ blobId: "abc123", size: 42 }),
      });

      const content = new TextEncoder().encode('{"name":"test"}');
      const result = await client.uploadBlob(
        "space-1",
        "bucket-2",
        content,
        "manifest.json",
      );

      expect(result).toEqual({ blobId: "abc123" });
      expect(mockFetch).toHaveBeenCalledWith(
        "https://api.testnet.harbor.walrus.xyz/api/v1/spaces/space-1/buckets/bucket-2/files",
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({
            Authorization: "Bearer hbr_test_key_123",
            "Content-Type": "application/octet-stream",
            "X-Filename": "manifest.json",
          }),
        }),
      );
    });

    it("throws on non-2xx response with status and body", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 403,
        text: async () => "Forbidden: invalid API key",
      });

      await expect(
        client.uploadBlob("s", "b", new Uint8Array([1]), "f.json"),
      ).rejects.toThrow("Walrus upload failed: 403 Forbidden: invalid API key");
    });

    it("throws on server error with status and body", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "Internal Server Error",
      });

      await expect(
        client.uploadBlob("s", "b", new Uint8Array([1]), "f.json"),
      ).rejects.toThrow("Walrus upload failed: 500 Internal Server Error");
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
        "Walrus download failed: 502 Bad Gateway",
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
