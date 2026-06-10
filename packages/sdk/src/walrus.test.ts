import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WalrusClient,
  DEFAULT_WALRUS_PUBLISHER,
  DEFAULT_WALRUS_AGGREGATOR,
} from "./walrus.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("WalrusClient", () => {
  let client: WalrusClient;

  beforeEach(() => {
    client = new WalrusClient();
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.stubGlobal("fetch", mockFetch);
  });

  describe("uploadBlob", () => {
    it("PUTs to the publisher /v1/blobs and returns the newlyCreated blobId", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          newlyCreated: { blobObject: { blobId: "BLOB_NEW" } },
        }),
      });

      const { blobId } = await client.uploadBlob(
        new TextEncoder().encode("hello"),
      );

      expect(blobId).toBe("BLOB_NEW");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${DEFAULT_WALRUS_PUBLISHER}/v1/blobs`);
      expect(init.method).toBe("PUT");
    });

    it("returns the alreadyCertified blobId when the blob already exists", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ alreadyCertified: { blobId: "BLOB_OLD" } }),
      });

      const { blobId } = await client.uploadBlob(new Uint8Array([1, 2, 3]));
      expect(blobId).toBe("BLOB_OLD");
    });

    it("passes epochs and permanent query params", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          newlyCreated: { blobObject: { blobId: "B" } },
        }),
      });

      await client.uploadBlob(new Uint8Array([1]), {
        epochs: 5,
        permanent: true,
      });

      const [url] = mockFetch.mock.calls[0];
      expect(url).toContain("epochs=5");
      expect(url).toContain("permanent=true");
    });

    it("throws on a non-2xx publisher response", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "boom",
      });

      await expect(client.uploadBlob(new Uint8Array([1]))).rejects.toThrow(
        /Walrus upload failed: 500 boom/,
      );
    });

    it("throws when the response carries no blobId", async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      });

      await expect(client.uploadBlob(new Uint8Array([1]))).rejects.toThrow(
        /missing blobId/,
      );
    });
  });

  describe("downloadBlob", () => {
    it("GETs the aggregator /v1/blobs/{id} and returns the bytes", async () => {
      const bytes = new TextEncoder().encode("payload");
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        arrayBuffer: async () => bytes.buffer,
      });

      const out = await client.downloadBlob("BLOB_X");

      expect(new TextDecoder().decode(out)).toBe("payload");
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toBe(`${DEFAULT_WALRUS_AGGREGATOR}/v1/blobs/BLOB_X`);
      expect(init.method).toBe("GET");
    });

    it("throws 'Manifest blob not found' on 404", async () => {
      mockFetch.mockResolvedValue({ status: 404, ok: false });

      await expect(client.downloadBlob("missing")).rejects.toThrow(
        "Manifest blob not found: missing",
      );
    });

    it("throws a descriptive error on other non-2xx responses", async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => "unavailable",
      });

      await expect(client.downloadBlob("x")).rejects.toThrow(
        /Walrus download failed: 503 unavailable/,
      );
    });
  });

  describe("custom endpoints", () => {
    it("uses provided publisher/aggregator URLs and trims trailing slashes", async () => {
      const c = new WalrusClient({
        publisherUrl: "https://pub.example.com//",
        aggregatorUrl: "https://agg.example.com//",
      });
      mockFetch.mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ newlyCreated: { blobObject: { blobId: "B" } } }),
      });

      await c.uploadBlob(new Uint8Array([1]));
      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://pub.example.com/v1/blobs",
      );
    });
  });
});
