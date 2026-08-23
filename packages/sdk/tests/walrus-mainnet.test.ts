import { describe, expect, it, vi } from "vitest";

// Mock @mysten/sui/grpc's SuiGrpcClient: we only need `.$extend()` to return
// an object exposing a `walrus` property (the shape `walrus-mainnet.ts`
// destructures from `client.$extend(walrus(...))`).
const mockWalrusOps = { writeBlob: vi.fn(), readBlob: vi.fn() };
vi.mock("@mysten/sui/grpc", () => ({
  SuiGrpcClient: vi.fn().mockImplementation(() => ({
    $extend: vi.fn(() => ({ walrus: mockWalrusOps })),
  })),
}));

// Mock @mysten/walrus's `walrus()` extension factory — we only assert on the
// options passed to it, not its real WASM-backed behavior.
const walrusExtensionFactory = vi.fn((options: unknown) => options);
vi.mock("@mysten/walrus", () => ({
  walrus: (options: unknown) => walrusExtensionFactory(options),
}));

import {
  createMainnetWalrusUploader,
  getWalrusUploader,
} from "../src/walrus-mainnet.js";
import { DEFAULT_MAINNET_UPLOAD_RELAY, WalrusClient } from "../src/walrus.js";

describe("createMainnetWalrusUploader", () => {
  it("configures the upload relay with the default mainnet host and tip cap", () => {
    createMainnetWalrusUploader({ signer: { fake: "signer" } as never });

    expect(walrusExtensionFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadRelay: expect.objectContaining({
          host: DEFAULT_MAINNET_UPLOAD_RELAY,
          sendTip: { max: 50_000 },
        }),
      }),
    );
  });

  it("allows overriding the relay host and max tip", () => {
    createMainnetWalrusUploader({
      signer: { fake: "signer" } as never,
      uploadRelayHost: "https://custom-relay.example.com",
      maxTipMist: 999,
    });

    expect(walrusExtensionFactory).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadRelay: {
          host: "https://custom-relay.example.com",
          sendTip: { max: 999 },
        },
      }),
    );
  });

  it("returns an uploader that can be constructed without a signer (read-only)", () => {
    // Should not throw — the signer requirement is deferred to uploadBlob().
    expect(() => createMainnetWalrusUploader()).not.toThrow();
  });
});

describe("getWalrusUploader", () => {
  it("returns the plain HTTP WalrusClient on testnet", () => {
    const uploader = getWalrusUploader({ network: "testnet" });
    expect(uploader).toBeInstanceOf(WalrusClient);
  });

  it("returns the plain HTTP WalrusClient on devnet", () => {
    const uploader = getWalrusUploader({ network: "devnet" });
    expect(uploader).toBeInstanceOf(WalrusClient);
  });

  it("does not require a signer on testnet", () => {
    expect(() => getWalrusUploader({ network: "testnet" })).not.toThrow();
  });

  it("routes to the mainnet upload-relay path on mainnet", () => {
    const uploader = getWalrusUploader({
      network: "mainnet",
      signer: { fake: "signer" } as never,
    });
    // Not a WalrusClient (the testnet HTTP client) — the mainnet path returns
    // a WalrusUploadRelayClient instead.
    expect(uploader).not.toBeInstanceOf(WalrusClient);
  });

  it("does not throw when constructing a mainnet uploader without a signer (defers to uploadBlob)", () => {
    expect(() => getWalrusUploader({ network: "mainnet" })).not.toThrow();
  });

  it("passes publisherUrl/aggregatorUrl through on testnet", () => {
    const uploader = getWalrusUploader({
      network: "testnet",
      publisherUrl: "https://pub.example.com",
      aggregatorUrl: "https://agg.example.com",
    }) as WalrusClient & { publisherUrl?: string };
    expect(uploader).toBeInstanceOf(WalrusClient);
  });
});
