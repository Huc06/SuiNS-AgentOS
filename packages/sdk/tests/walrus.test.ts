import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  WalrusClient,
  WalrusUploadRelayClient,
  DEFAULT_WALRUS_PUBLISHER,
  DEFAULT_WALRUS_AGGREGATOR,
  DEFAULT_WALRUS_EPOCHS,
  type WalrusMainnetOperations,
} from "../src/walrus.js";

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

describe("WalrusUploadRelayClient", () => {
  function makeMainnetOps(
    overrides: Partial<WalrusMainnetOperations> = {},
  ): WalrusMainnetOperations {
    return {
      writeBlob:
        overrides.writeBlob ??
        vi.fn(async () => ({
          blobId: "MAINNET_BLOB",
          blobObject: { storage: { end_epoch: 42 } },
        })),
      readBlob: overrides.readBlob ?? vi.fn(async () => new Uint8Array([9, 9])),
    };
  }

  describe("uploadBlob", () => {
    it("throws when constructed without a signer", async () => {
      const ops = makeMainnetOps();
      const client = new WalrusUploadRelayClient(ops);

      await expect(
        client.uploadBlob(new Uint8Array([1])),
      ).rejects.toThrow(/signer is required/);
      expect(ops.writeBlob).not.toHaveBeenCalled();
    });

    it("calls writeBlob with the signer, epochs, and deletable:true by default", async () => {
      const ops = makeMainnetOps();
      const signer = { fake: "signer" };
      const client = new WalrusUploadRelayClient(ops, signer);

      const result = await client.uploadBlob(new Uint8Array([1, 2, 3]), {
        epochs: 10,
      });

      expect(result.blobId).toBe("MAINNET_BLOB");
      expect(result.endEpoch).toBe(42);
      expect(ops.writeBlob).toHaveBeenCalledWith({
        blob: new Uint8Array([1, 2, 3]),
        deletable: true,
        epochs: 10,
        signer,
      });
    });

    it("maps permanent:true to deletable:false", async () => {
      const ops = makeMainnetOps();
      const client = new WalrusUploadRelayClient(ops, { fake: "signer" });

      await client.uploadBlob(new Uint8Array([1]), { permanent: true });

      expect(ops.writeBlob).toHaveBeenCalledWith(
        expect.objectContaining({ deletable: false }),
      );
    });

    it("defaults epochs to DEFAULT_WALRUS_EPOCHS when omitted", async () => {
      const ops = makeMainnetOps();
      const client = new WalrusUploadRelayClient(ops, { fake: "signer" });

      await client.uploadBlob(new Uint8Array([1]));

      expect(ops.writeBlob).toHaveBeenCalledWith(
        expect.objectContaining({ epochs: DEFAULT_WALRUS_EPOCHS }),
      );
    });

    it("omits endEpoch when writeBlob's result has none", async () => {
      const ops = makeMainnetOps({
        writeBlob: vi.fn(async () => ({ blobId: "B", blobObject: undefined })),
      });
      const client = new WalrusUploadRelayClient(ops, { fake: "signer" });

      const result = await client.uploadBlob(new Uint8Array([1]));
      expect(result).toEqual({ blobId: "B" });
    });
  });

  describe("downloadBlob", () => {
    it("delegates to readBlob and needs no signer", async () => {
      const ops = makeMainnetOps();
      const client = new WalrusUploadRelayClient(ops);

      const bytes = await client.downloadBlob("SOME_BLOB");

      expect(bytes).toEqual(new Uint8Array([9, 9]));
      expect(ops.readBlob).toHaveBeenCalledWith({ blobId: "SOME_BLOB" });
    });
  });
});
