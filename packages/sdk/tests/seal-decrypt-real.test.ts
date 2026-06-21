import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Mock @mysten/seal so the REAL-Seal decrypt helper is exercised deterministically
 * without a live wallet, network, or key-server deployment. The mocks let us
 * assert the wallet-bound session flow (sign the personal message → fetch shares
 * gated by seal_approve → decrypt) wires together correctly.
 */
const sealMocks = vi.hoisted(() => ({
  getAllowlistedKeyServers: vi.fn(),
  retrieveKeyServers: vi.fn(),
  fetchKeys: vi.fn(),
  decrypt: vi.fn(),
  parse: vi.fn(),
  getPersonalMessage: vi.fn(),
  setPersonalMessageSignature: vi.fn(),
  sessionCtor: vi.fn(),
}));

vi.mock("@mysten/seal", () => {
  class SessionKey {
    constructor(packageId: Uint8Array, ttlMin: number) {
      sealMocks.sessionCtor(packageId, ttlMin);
    }
    getPersonalMessage() {
      return sealMocks.getPersonalMessage();
    }
    setPersonalMessageSignature(sig: string) {
      sealMocks.setPersonalMessageSignature(sig);
    }
  }
  class KeyStore {
    fetchKeys(args: unknown) {
      return sealMocks.fetchKeys(args);
    }
    decrypt(obj: unknown) {
      return sealMocks.decrypt(obj);
    }
  }
  return {
    SessionKey,
    KeyStore,
    getAllowlistedKeyServers: sealMocks.getAllowlistedKeyServers,
    retrieveKeyServers: sealMocks.retrieveKeyServers,
    EncryptedObject: { parse: sealMocks.parse },
  };
});

// Mock the Transaction so building the seal_approve PTB returns deterministic
// bytes without needing a real SuiClient. We capture the moveCall target/args.
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
    moveCall(args: unknown) {
      txMocks.moveCall(args);
    }
    build(args: unknown) {
      return txMocks.build(args);
    }
  }
  return { Transaction };
});

import { SEAL_REAL_MAGIC } from "../src/seal-real.js";
import {
  sealDecryptReal,
  stripRealSealMarker,
} from "../src/seal-decrypt-real.js";

const PACKAGE_ID =
  "0x6cc3fb480fd82972f4996b4b18240b0fe56407e26070690ad538862ef26e1e71";
const BUCKET_POLICY_ID =
  "0x00000000000000000000000000000000000000000000000000000000000a905a";
const fakeSuiClient = {} as never;

beforeEach(() => {
  Object.values(sealMocks).forEach((m) => m.mockReset());
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
    const obj = new Uint8Array([1, 2, 3]);
    const marked = new Uint8Array([
      ...new TextEncoder().encode(SEAL_REAL_MAGIC),
      ...obj,
    ]);
    expect(stripRealSealMarker(marked)).toEqual(obj);
    // Unmarked bytes pass through verbatim.
    expect(stripRealSealMarker(obj)).toEqual(obj);
  });
});

describe("sealDecryptReal (real Mysten Seal read path, client-side)", () => {
  function wireHappyPath(plaintext: Uint8Array) {
    const idBytes = [5, 6, 7];
    sealMocks.parse.mockReturnValue({ id: idBytes, threshold: 1 });
    sealMocks.getAllowlistedKeyServers.mockReturnValue([new Uint8Array([1])]);
    sealMocks.retrieveKeyServers.mockResolvedValue([
      { objectId: new Uint8Array([1]), name: "ks", url: "u", keyType: 0, pk: new Uint8Array([1]) },
    ]);
    sealMocks.getPersonalMessage.mockReturnValue(new Uint8Array([42]));
    txMocks.build.mockResolvedValue(new Uint8Array([9, 9]));
    sealMocks.fetchKeys.mockResolvedValue(undefined);
    sealMocks.decrypt.mockResolvedValue(plaintext);
    return idBytes;
  }

  it("runs the full wallet-bound decrypt flow and returns the plaintext", async () => {
    const plaintext = new TextEncoder().encode("the secret manifest");
    const idBytes = wireHappyPath(plaintext);

    const signPersonalMessage = vi.fn(async (_m: Uint8Array) => ({
      signature: "BASE64SIG",
    }));

    const marked = new Uint8Array([
      ...new TextEncoder().encode(SEAL_REAL_MAGIC),
      1,
      2,
      3,
    ]);
    const out = await sealDecryptReal({
      data: marked,
      bucketPolicyId: BUCKET_POLICY_ID,
      packageId: PACKAGE_ID,
      suiClient: fakeSuiClient,
      signPersonalMessage,
    });

    expect(out).toEqual(plaintext);

    // The marker was stripped before BCS parsing.
    const parsed = sealMocks.parse.mock.calls[0]?.[0] as Uint8Array;
    expect(Array.from(parsed)).toEqual([1, 2, 3]);

    // The USER WALLET signed the session's personal message, and the signature
    // was set back on the session.
    expect(signPersonalMessage).toHaveBeenCalledOnce();
    expect(signPersonalMessage).toHaveBeenCalledWith(new Uint8Array([42]));
    expect(sealMocks.setPersonalMessageSignature).toHaveBeenCalledWith(
      "BASE64SIG",
    );

    // The seal_approve PTB targeted bucket_policy with the object's id bytes +
    // the BucketPolicy object.
    const move = txMocks.moveCall.mock.calls[0]?.[0] as {
      target: string;
      arguments: unknown[];
    };
    expect(move.target).toMatch(/::bucket_policy::seal_approve$/);
    expect(txMocks.pureVector).toHaveBeenCalledWith("u8", idBytes);
    expect(txMocks.object).toHaveBeenCalledWith(BUCKET_POLICY_ID);
    // Built with onlyTransactionKind (no gas/sender execution).
    expect(txMocks.build).toHaveBeenCalledWith(
      expect.objectContaining({ onlyTransactionKind: true }),
    );

    // fetchKeys got the txBytes + session + ids, then decrypt ran.
    const fk = sealMocks.fetchKeys.mock.calls[0]?.[0] as {
      txBytes: Uint8Array;
      threshold: number;
      ids: Uint8Array[];
    };
    expect(fk.txBytes).toEqual(new Uint8Array([9, 9]));
    expect(fk.threshold).toBe(1);
    expect(sealMocks.decrypt).toHaveBeenCalledOnce();
  });

  it("throws (no silent fallback) when fetchKeys fails — e.g. not the bucket owner", async () => {
    wireHappyPath(new Uint8Array([1]));
    sealMocks.fetchKeys.mockRejectedValue(
      new Error("seal_approve aborted: not the owner"),
    );

    await expect(
      sealDecryptReal({
        data: new Uint8Array([1, 2, 3]),
        bucketPolicyId: BUCKET_POLICY_ID,
        packageId: PACKAGE_ID,
        suiClient: fakeSuiClient,
        signPersonalMessage: async () => ({ signature: "S" }),
      }),
    ).rejects.toThrow(/seal_approve aborted/);
    expect(sealMocks.decrypt).not.toHaveBeenCalled();
  });

  it("rejects a non-0x bucketPolicyId without touching the wallet/network", async () => {
    const signPersonalMessage = vi.fn();
    await expect(
      sealDecryptReal({
        data: new Uint8Array([1]),
        bucketPolicyId: "not-an-id",
        packageId: PACKAGE_ID,
        suiClient: fakeSuiClient,
        signPersonalMessage,
      }),
    ).rejects.toThrow(/bucketPolicyId must be a 0x/);
    expect(signPersonalMessage).not.toHaveBeenCalled();
    expect(sealMocks.parse).not.toHaveBeenCalled();
  });
});
