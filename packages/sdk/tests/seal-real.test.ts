import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sealMocks = vi.hoisted(() => ({
  clientCtor: vi.fn(),
  encrypt: vi.fn(),
}));

vi.mock("@mysten/seal", () => {
  class SealClient {
    constructor(options: unknown) {
      sealMocks.clientCtor(options);
    }
    encrypt(options: unknown) {
      return sealMocks.encrypt(options);
    }
  }
  return { SealClient };
});

import {
  HARBOR_SEAL_KEY_SERVER_OBJECT_IDS,
  HARBOR_SEAL_ORIGINAL_PACKAGE_ID,
  isRealSeal,
  SEAL_REAL_MAGIC,
  sealEncryptHarbor,
  sealEncryptReal,
} from "../src/seal-real.js";

const PACKAGE_ID =
  "0x6cc3fb480fd82972f4996b4b18240b0fe56407e26070690ad538862ef26e1e71";
const POLICY = "0xabc123";
const fakeSuiClient = { core: {} } as never;

beforeEach(() => {
  sealMocks.clientCtor.mockReset();
  sealMocks.encrypt.mockReset();
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("sealEncryptReal", () => {
  it("returns a marked AgentOS envelope around the real encrypted object", async () => {
    const encryptedObject = new Uint8Array([10, 20, 30, 40]);
    sealMocks.encrypt.mockResolvedValue({ encryptedObject, key: new Uint8Array([1]) });

    const result = await sealEncryptReal({
      data: new TextEncoder().encode("secret manifest"),
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    });

    expect(result).not.toBeNull();
    expect(result!.encryptedObject).toEqual(encryptedObject);
    expect(result!.threshold).toBe(1);
    expect(result!.keyServerCount).toBe(3);
    expect(isRealSeal(result!.bytes)).toBe(true);
    expect(new TextDecoder().decode(result!.bytes.subarray(0, SEAL_REAL_MAGIC.length))).toBe(SEAL_REAL_MAGIC);
    expect(result!.bytes.subarray(SEAL_REAL_MAGIC.length)).toEqual(encryptedObject);
  });

  it("clamps the legacy threshold to the configured key servers", async () => {
    sealMocks.encrypt.mockResolvedValue({ encryptedObject: new Uint8Array([1]) });
    const result = await sealEncryptReal({
      data: new Uint8Array([1]),
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
      threshold: 99,
    });
    expect(result!.threshold).toBe(3);
    expect(sealMocks.encrypt).toHaveBeenCalledWith(expect.objectContaining({ threshold: 3 }));
  });

  it("returns null when encryption fails", async () => {
    sealMocks.encrypt.mockRejectedValue(new Error("key server unavailable"));
    await expect(sealEncryptReal({
      data: new Uint8Array([1]),
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
      packageId: PACKAGE_ID,
    })).resolves.toBeNull();
  });
});

describe("sealEncryptHarbor", () => {
  it("uses Harbor's canonical package, three servers, threshold two and raw bytes", async () => {
    const encryptedObject = new Uint8Array([8, 6, 7, 5, 3, 0, 9]);
    sealMocks.encrypt.mockResolvedValue({ encryptedObject });

    const result = await sealEncryptHarbor({
      data: new Uint8Array([137, 80, 78, 71]),
      sealPolicyId: POLICY,
      suiClient: fakeSuiClient,
    });

    expect(result).toEqual(encryptedObject);
    expect(isRealSeal(result)).toBe(false);
    expect(sealMocks.clientCtor).toHaveBeenCalledWith({
      suiClient: fakeSuiClient,
      serverConfigs: HARBOR_SEAL_KEY_SERVER_OBJECT_IDS.map((objectId) => ({ objectId, weight: 1 })),
      verifyKeyServers: false,
    });
    const call = sealMocks.encrypt.mock.calls[0]?.[0] as {
      threshold: number;
      packageId: string;
      id: string;
      data: Uint8Array;
    };
    expect(call.threshold).toBe(2);
    expect(call.packageId).toBe(HARBOR_SEAL_ORIGINAL_PACKAGE_ID);
    expect(call.id).toMatch(/^[0-9a-f]+$/i);
    expect(call.id).toHaveLength(128);
    expect(call.data).toEqual(new Uint8Array([137, 80, 78, 71]));
  });

  it("rejects a non-object-id policy before constructing a client", async () => {
    await expect(sealEncryptHarbor({
      data: new Uint8Array([1]),
      sealPolicyId: "demo-policy",
      suiClient: fakeSuiClient,
    })).rejects.toThrow("Harbor Seal requires a concrete 0x seal_policy_id");
    expect(sealMocks.clientCtor).not.toHaveBeenCalled();
  });
});
