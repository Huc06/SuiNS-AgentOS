import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock @mysten/seal so we exercise the REAL-Seal write helper deterministically,
 * without a live network or key-server deployment. Each test resets the mock
 * implementations via the captured `sealMocks` handle.
 */
const sealMocks = vi.hoisted(() => ({
  getAllowlistedKeyServers: vi.fn(),
  retrieveKeyServers: vi.fn(),
  encrypt: vi.fn(),
  aesGcmCtor: vi.fn(),
}));

vi.mock("@mysten/seal", () => {
  class AesGcm256 {
    constructor(
      public readonly plaintext: Uint8Array,
      public readonly aad: Uint8Array,
    ) {
      sealMocks.aesGcmCtor(plaintext, aad);
    }
  }
  return {
    AesGcm256,
    encrypt: sealMocks.encrypt,
    getAllowlistedKeyServers: sealMocks.getAllowlistedKeyServers,
    retrieveKeyServers: sealMocks.retrieveKeyServers,
  };
});

import {
  sealEncryptReal,
  isRealSeal,
  SEAL_REAL_MAGIC,
} from "../src/seal-real.js";

const PACKAGE_ID =
  "0x6cc3fb480fd82972f4996b4b18240b0fe56407e26070690ad538862ef26e1e71";
const POLICY = "0xabc123";

/** A stand-in read-only SuiClient — never actually called (key servers mocked). */
const fakeSuiClient = {} as never;

function keyServer(objectId: Uint8Array) {
  return {
    objectId,
    name: "ks",
    url: "https://ks.example",
    keyType: 0,
    pk: new Uint8Array([1, 2, 3]),
  };
}

beforeEach(() => {
  sealMocks.getAllowlistedKeyServers.mockReset();
  sealMocks.retrieveKeyServers.mockReset();
  sealMocks.encrypt.mockReset();
  sealMocks.aesGcmCtor.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sealEncryptReal (real Mysten Seal write path)", () => {
  it("encrypts via the real Seal protocol and returns marked EncryptedObject bytes", async () => {
    const objId = new Uint8Array([9, 9, 9]);
    sealMocks.getAllowlistedKeyServers.mockReturnValue([objId]);
    sealMocks.retrieveKeyServers.mockResolvedValue([keyServer(objId)]);
    const encryptedObject = new Uint8Array([10, 20, 30, 40]);
    sealMocks.encrypt.mockResolvedValue({
      encryptedObject,
      key: new Uint8Array([0xaa]),
    });

    const data = new TextEncoder().encode("super secret manifest");
    const result = await sealEncryptReal({
      data,
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
      network: "testnet",
    });

    expect(result).not.toBeNull();
    expect(result!.encryptedObject).toEqual(encryptedObject);
    expect(result!.keyServerCount).toBe(1);
    expect(result!.threshold).toBe(1);

    // The marker is prepended so a decrypt path can route real-Seal vs AES.
    expect(isRealSeal(result!.bytes)).toBe(true);
    const magic = new TextDecoder().decode(
      result!.bytes.subarray(0, SEAL_REAL_MAGIC.length),
    );
    expect(magic).toBe(SEAL_REAL_MAGIC);
    // The bytes after the marker are exactly the EncryptedObject.
    expect(result!.bytes.subarray(SEAL_REAL_MAGIC.length)).toEqual(
      encryptedObject,
    );

    // The network helper + key-server retrieval ran with the read-only client.
    expect(sealMocks.getAllowlistedKeyServers).toHaveBeenCalledWith("testnet");
    expect(sealMocks.retrieveKeyServers).toHaveBeenCalledWith({
      objectIds: [objId],
      client: fakeSuiClient,
    });

    // encrypt() was called with package bytes (32), id bytes (32), threshold 1,
    // and the AesGcm256 wrapper over the plaintext.
    const call = sealMocks.encrypt.mock.calls[0]?.[0] as {
      keyServers: unknown[];
      threshold: number;
      packageId: Uint8Array;
      id: Uint8Array;
      encryptionInput: { plaintext: Uint8Array };
    };
    expect(call.threshold).toBe(1);
    expect(call.packageId).toBeInstanceOf(Uint8Array);
    expect(call.packageId.length).toBe(32);
    expect(call.id).toBeInstanceOf(Uint8Array);
    expect(call.id.length).toBe(32);
    expect(call.encryptionInput.plaintext).toEqual(data);
    // AesGcm256 was constructed with the plaintext + an (empty) AAD.
    expect(sealMocks.aesGcmCtor).toHaveBeenCalledTimes(1);
  });

  it("clamps the threshold to the number of available key servers", async () => {
    const ids = [new Uint8Array([1]), new Uint8Array([2])];
    sealMocks.getAllowlistedKeyServers.mockReturnValue(ids);
    sealMocks.retrieveKeyServers.mockResolvedValue(ids.map(keyServer));
    sealMocks.encrypt.mockResolvedValue({
      encryptedObject: new Uint8Array([1]),
      key: new Uint8Array([2]),
    });

    const result = await sealEncryptReal({
      data: new Uint8Array([1, 2, 3]),
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
      threshold: 5, // more than the 2 servers available
    });

    expect(result!.threshold).toBe(2);
    const call = sealMocks.encrypt.mock.calls[0]?.[0] as { threshold: number };
    expect(call.threshold).toBe(2);
  });

  it("derives a stable 32-byte id from a non-address policy id", async () => {
    const objId = new Uint8Array([7]);
    sealMocks.getAllowlistedKeyServers.mockReturnValue([objId]);
    sealMocks.retrieveKeyServers.mockResolvedValue([keyServer(objId)]);
    sealMocks.encrypt.mockResolvedValue({
      encryptedObject: new Uint8Array([1]),
      key: new Uint8Array([2]),
    });

    await sealEncryptReal({
      data: new Uint8Array([1]),
      sealPolicyId: "my-opaque-policy-name",
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });

    const call = sealMocks.encrypt.mock.calls[0]?.[0] as { id: Uint8Array };
    expect(call.id).toBeInstanceOf(Uint8Array);
    expect(call.id.length).toBe(32); // sha256-derived id
  });

  it("returns null (caller falls back to AES) when encrypt throws", async () => {
    const objId = new Uint8Array([1]);
    sealMocks.getAllowlistedKeyServers.mockReturnValue([objId]);
    sealMocks.retrieveKeyServers.mockResolvedValue([keyServer(objId)]);
    sealMocks.encrypt.mockRejectedValue(new Error("key server unreachable"));

    const result = await sealEncryptReal({
      data: new Uint8Array([1]),
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });
    expect(result).toBeNull();
  });

  it("returns null when no key servers are allowlisted", async () => {
    sealMocks.getAllowlistedKeyServers.mockReturnValue([]);
    const result = await sealEncryptReal({
      data: new Uint8Array([1]),
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });
    expect(result).toBeNull();
    expect(sealMocks.retrieveKeyServers).not.toHaveBeenCalled();
  });

  it("returns null when retrieveKeyServers resolves empty", async () => {
    sealMocks.getAllowlistedKeyServers.mockReturnValue([new Uint8Array([1])]);
    sealMocks.retrieveKeyServers.mockResolvedValue([]);
    const result = await sealEncryptReal({
      data: new Uint8Array([1]),
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });
    expect(result).toBeNull();
  });

  it("returns null without touching the network when packageId is not a 0x id", async () => {
    const result = await sealEncryptReal({
      data: new Uint8Array([1]),
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
      packageId: "@agentos/contracts",
    });
    expect(result).toBeNull();
    expect(sealMocks.getAllowlistedKeyServers).not.toHaveBeenCalled();
  });

  it("returns null when the sealPolicyId is empty", async () => {
    const result = await sealEncryptReal({
      data: new Uint8Array([1]),
      sealPolicyId: "",
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });
    expect(result).toBeNull();
    expect(sealMocks.getAllowlistedKeyServers).not.toHaveBeenCalled();
  });
});

describe("isRealSeal", () => {
  it("recognizes the real-Seal marker and rejects other bytes", () => {
    const real = new Uint8Array([
      ...new TextEncoder().encode(SEAL_REAL_MAGIC),
      1,
      2,
      3,
    ]);
    expect(isRealSeal(real)).toBe(true);
    // The AES demo envelope magic must NOT be mistaken for real Seal.
    expect(isRealSeal(new TextEncoder().encode("AOSEAL1xxxx"))).toBe(false);
    expect(isRealSeal(new Uint8Array([]))).toBe(false);
  });
});
