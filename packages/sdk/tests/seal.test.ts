import { describe, expect, it } from "vitest";
import fc from "fast-check";

import {
  sealEncrypt,
  sealDecrypt,
  deriveGroupId,
  deriveMembershipProof,
} from "../src/seal.js";

const POLICY = "0xpolicy123";

describe("sealEncrypt / sealDecrypt", () => {
  it("produces ciphertext that differs from the plaintext", async () => {
    const plaintext = new TextEncoder().encode("super secret manifest");
    const ciphertext = await sealEncrypt(plaintext, POLICY);

    // The encrypted envelope must not equal the original bytes.
    expect(Buffer.from(ciphertext).equals(Buffer.from(plaintext))).toBe(false);
    expect(ciphertext.length).toBeGreaterThan(plaintext.length);
  });

  it("round-trips encrypt -> decrypt with a valid membership proof", async () => {
    const plaintext = new TextEncoder().encode(
      JSON.stringify({ name: "trade", version: "1.0.0" }),
    );
    const ciphertext = await sealEncrypt(plaintext, POLICY);
    const proof = deriveMembershipProof(POLICY);

    const decrypted = await sealDecrypt(ciphertext, POLICY, proof);
    expect(Buffer.from(decrypted).equals(Buffer.from(plaintext))).toBe(true);
  });

  it("accepts a membership proof passed as an object", async () => {
    const plaintext = new TextEncoder().encode("hello");
    const ciphertext = await sealEncrypt(plaintext, POLICY);
    const proof = deriveMembershipProof(POLICY);

    const decrypted = await sealDecrypt(ciphertext, POLICY, { proof });
    expect(new TextDecoder().decode(decrypted)).toBe("hello");
  });

  it("throws access-denied with the group id when the proof is missing", async () => {
    const ciphertext = await sealEncrypt(
      new TextEncoder().encode("data"),
      POLICY,
    );
    const groupId = deriveGroupId(POLICY);

    await expect(sealDecrypt(ciphertext, POLICY)).rejects.toThrow(
      `Access denied: not a member of group ${groupId}`,
    );
  });

  it("throws access-denied with the group id when the proof is invalid", async () => {
    const ciphertext = await sealEncrypt(
      new TextEncoder().encode("data"),
      POLICY,
    );
    const groupId = deriveGroupId(POLICY);

    await expect(
      sealDecrypt(ciphertext, POLICY, "wrong-proof"),
    ).rejects.toThrow(`Access denied: not a member of group ${groupId}`);
  });

  it("rejects a proof valid for a different policy", async () => {
    const ciphertext = await sealEncrypt(
      new TextEncoder().encode("data"),
      POLICY,
    );
    const otherProof = deriveMembershipProof("0xotherpolicy");
    const groupId = deriveGroupId(POLICY);

    await expect(sealDecrypt(ciphertext, POLICY, otherProof)).rejects.toThrow(
      `Access denied: not a member of group ${groupId}`,
    );
  });

  it("requires a non-empty policyId", async () => {
    await expect(
      sealEncrypt(new TextEncoder().encode("x"), ""),
    ).rejects.toThrow(/non-empty policyId/);
  });

  it("round-trips arbitrary byte payloads (property)", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uint8Array({ minLength: 0, maxLength: 512 }),
        fc.string({ minLength: 1, maxLength: 32 }),
        async (bytes, policyId) => {
          const data = new Uint8Array(bytes);
          const ciphertext = await sealEncrypt(data, policyId);
          const proof = deriveMembershipProof(policyId);
          const decrypted = await sealDecrypt(ciphertext, policyId, proof);
          return Buffer.from(decrypted).equals(Buffer.from(data));
        },
      ),
      { numRuns: 50 },
    );
  });
});
