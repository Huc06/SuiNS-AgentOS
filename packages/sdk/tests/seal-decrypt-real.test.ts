import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sealMocks = vi.hoisted(() => ({
  parse: vi.fn(),
  sessionCreate: vi.fn(),
  getPersonalMessage: vi.fn(),
  setPersonalMessageSignature: vi.fn(),
  clientCtor: vi.fn(),
  decrypt: vi.fn(),
}));

vi.mock("@mysten/seal", () => {
  class SessionKey {
    static create(options: unknown) {
      sealMocks.sessionCreate(options);
      return Promise.resolve(new SessionKey());
    }
    getPersonalMessage() {
      return sealMocks.getPersonalMessage();
    }
    setPersonalMessageSignature(signature: string) {
      return sealMocks.setPersonalMessageSignature(signature);
    }
  }
  class SealClient {
    constructor(options: unknown) {
      sealMocks.clientCtor(options);
    }
    decrypt(options: unknown) {
      return sealMocks.decrypt(options);
    }
  }
  return { SessionKey, SealClient, EncryptedObject: { parse: sealMocks.parse } };
});

const txMocks = vi.hoisted(() => ({
  moveCall: vi.fn(),
  build: vi.fn(),
  pureVector: vi.fn((_t: string, v: number[]) => ({ pure: v })),
  object: vi.fn((id: string) => ({ object: id })),
}));

vi.mock("@mysten/sui/transactions", () => {
  class Transaction {
    pure = { vector: txMocks.pureVector };
    object = txMocks.object;
    moveCall(args: unknown) { txMocks.moveCall(args); }
    build(args: unknown) { return txMocks.build(args); }
  }
  return { Transaction };
});

import { SEAL_REAL_MAGIC } from "../src/seal-real.js";
import { sealDecryptReal, stripRealSealMarker } from "../src/seal-decrypt-real.js";

const PACKAGE_ID = "0x6cc3fb480fd82972f4996b4b18240b0fe56407e26070690ad538862ef26e1e71";
const BUCKET_POLICY_ID = "0x00000000000000000000000000000000000000000000000000000000000a905a";
const fakeSuiClient = { core: {} } as never;

beforeEach(() => {
  Object.values(sealMocks).forEach((mock) => mock.mockReset());
  txMocks.moveCall.mockReset();
  txMocks.build.mockReset();
  txMocks.pureVector.mockClear();
  txMocks.object.mockClear();
});
afterEach(() => {
  vi.clearAllMocks();
});

describe("stripRealSealMarker", () => {
  it("strips the real-Seal marker and passes unmarked bytes through", () => {
    const object = new Uint8Array([1, 2, 3]);
    const marked = new Uint8Array([...new TextEncoder().encode(SEAL_REAL_MAGIC), ...object]);
    expect(stripRealSealMarker(marked)).toEqual(object);
    expect(stripRealSealMarker(object)).toEqual(object);
  });
});

describe("sealDecryptReal", () => {
  function wireHappyPath(plaintext: Uint8Array) {
    const id = new Uint8Array([5, 6, 7]);
    sealMocks.parse.mockReturnValue({ id });
    sealMocks.getPersonalMessage.mockReturnValue(new Uint8Array([42]));
    sealMocks.setPersonalMessageSignature.mockResolvedValue(undefined);
    txMocks.build.mockResolvedValue(new Uint8Array([9, 9]));
    sealMocks.decrypt.mockResolvedValue(plaintext);
    return id;
  }

  it("runs wallet SessionKey authorization, seal_approve PTB, then decrypts", async () => {
    const plaintext = new TextEncoder().encode("the secret manifest");
    const id = wireHappyPath(plaintext);
    const signPersonalMessage = vi.fn(async () => ({ signature: "BASE64SIG" }));

    const result = await sealDecryptReal({
      data: new Uint8Array([...new TextEncoder().encode(SEAL_REAL_MAGIC), 1, 2, 3]),
      bucketPolicyId: BUCKET_POLICY_ID,
      packageId: PACKAGE_ID,
      userAddress: "0x1",
      suiClient: fakeSuiClient,
      signPersonalMessage,
    });

    expect(result).toEqual(plaintext);
    expect(signPersonalMessage).toHaveBeenCalledWith(new Uint8Array([42]));
    expect(sealMocks.sessionCreate).toHaveBeenCalledWith(expect.objectContaining({
      address: expect.stringMatching(/^0x/), packageId: PACKAGE_ID, ttlMin: 10,
    }));
    expect(sealMocks.setPersonalMessageSignature).toHaveBeenCalledWith("BASE64SIG");
    expect(txMocks.pureVector).toHaveBeenCalledWith("u8", Array.from(id));
    expect(txMocks.object).toHaveBeenCalledWith(BUCKET_POLICY_ID);
    expect(txMocks.build).toHaveBeenCalledWith(expect.objectContaining({ onlyTransactionKind: true }));
    expect(sealMocks.decrypt).toHaveBeenCalledWith(expect.objectContaining({
      data: new Uint8Array([1, 2, 3]), txBytes: new Uint8Array([9, 9]),
    }));
  });

  it("throws decrypt access failures without a fallback", async () => {
    wireHappyPath(new Uint8Array([1]));
    sealMocks.decrypt.mockRejectedValue(new Error("seal_approve aborted: not the owner"));
    await expect(sealDecryptReal({
      data: new Uint8Array([1, 2, 3]), bucketPolicyId: BUCKET_POLICY_ID,
      packageId: PACKAGE_ID, userAddress: "0x1", suiClient: fakeSuiClient,
      signPersonalMessage: async () => ({ signature: "S" }),
    })).rejects.toThrow(/seal_approve aborted/);
  });

  it("rejects a malformed bucket policy without accessing the wallet", async () => {
    const signPersonalMessage = vi.fn();
    await expect(sealDecryptReal({
      data: new Uint8Array([1]), bucketPolicyId: "not-an-id", packageId: PACKAGE_ID,
      userAddress: "0x1", suiClient: fakeSuiClient, signPersonalMessage,
    })).rejects.toThrow(/bucketPolicyId must be a 0x/);
    expect(signPersonalMessage).not.toHaveBeenCalled();
  });
});
