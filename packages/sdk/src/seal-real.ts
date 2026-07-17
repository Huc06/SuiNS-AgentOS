/**
 * Real Mysten Seal encryption helpers (Node-only).
 *
 * `sealEncryptReal` retains AgentOS's marked envelope for legacy workflows.
 * `sealEncryptHarbor` emits raw BCS EncryptedObject bytes required by active
 * Harbor private buckets.
 */

import { createHash, randomBytes } from "node:crypto";

import { SealClient } from "@mysten/seal";
import { bcs } from "@mysten/sui/bcs";
import { fromHex, normalizeSuiAddress } from "@mysten/sui/utils";

/** Prefix used only for AgentOS legacy encrypted envelopes. */
export const SEAL_REAL_MAGIC = "SEALREAL1";

/** Networks accepted by the historical AgentOS write helper. */
export type SealNetwork = "testnet" | "mainnet";

export interface SealEncryptRealOptions {
  data: Uint8Array;
  sealPolicyId: string;
  suiClient: unknown;
  packageId: string;
  network?: SealNetwork;
  threshold?: number;
}

export interface SealEncryptRealResult {
  /** `SEALREAL1` followed by raw BCS EncryptedObject bytes. */
  bytes: Uint8Array;
  encryptedObject: Uint8Array;
  keyServerCount: number;
  threshold: number;
}

/** Harbor's canonical bucket-policy package and testnet Seal key servers. */
export const HARBOR_SEAL_ORIGINAL_PACKAGE_ID =
  "0x8b2429358e9b0f005b69fe8ad3cbd1268ad87f35047a21612e082c64824faf8d";
export const HARBOR_SEAL_KEY_SERVER_OBJECT_IDS = [
  "0x6068c0acb197dddbacd4746a9de7f025b2ed5a5b6c1b1ab44dade4426d141da2",
  "0x164ac3d2b3b8694b8181c13f671950004765c23f270321a45fdd04d40cccf0f2",
  "0x9c949e53c36ab7a9c484ed9e8b43267a77d4b8d70e79aa6b39042e3d4c434105",
] as const;

/** Options for encrypting a payload for an active Harbor private bucket. */
export interface HarborSealEncryptOptions {
  data: Uint8Array;
  sealPolicyId: string;
  /** A SuiGrpcClient (or a Seal-compatible extended client). */
  suiClient: unknown;
}

function deriveIdBytes(sealPolicyId: string): Uint8Array {
  const trimmed = sealPolicyId.trim();
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    try {
      return fromHex(normalizeSuiAddress(trimmed));
    } catch {
      // Fall through to the stable hash for malformed addresses.
    }
  }
  return new Uint8Array(createHash("sha256").update(`seal-id:${trimmed}`).digest());
}

function withMarker(encryptedObject: Uint8Array): Uint8Array {
  const magic = Buffer.from(SEAL_REAL_MAGIC, "utf8");
  return new Uint8Array(Buffer.concat([magic, Buffer.from(encryptedObject)]));
}

export function isRealSeal(bytes: Uint8Array): boolean {
  const magic = Buffer.from(SEAL_REAL_MAGIC, "utf8");
  return bytes.length >= magic.length && Buffer.from(bytes.subarray(0, magic.length)).equals(magic);
}

function createSealClient(suiClient: unknown) {
  return new SealClient({
    // The Seal SDK's public type requires an extended Sui client. A SuiGrpcClient
    // supplies the required `core` surface at runtime (as in Harbor Quickstart).
    suiClient: suiClient as never,
    serverConfigs: HARBOR_SEAL_KEY_SERVER_OBJECT_IDS.map((objectId) => ({
      objectId,
      weight: 1,
    })),
    verifyKeyServers: false,
  });
}

/**
 * AgentOS's legacy real-Seal writer. It remains non-throwing so old non-Harbor
 * workflows retain their AES fallback behavior.
 */
export async function sealEncryptReal(
  options: SealEncryptRealOptions,
): Promise<SealEncryptRealResult | null> {
  try {
    const policyId = options.sealPolicyId.trim();
    const packageId = options.packageId.trim();
    if (!policyId || !/^0x[0-9a-fA-F]+$/.test(packageId) || !options.suiClient) {
      return null;
    }
    const threshold = Math.max(
      1,
      Math.min(options.threshold ?? 1, HARBOR_SEAL_KEY_SERVER_OBJECT_IDS.length),
    );
    const { encryptedObject } = await createSealClient(options.suiClient).encrypt({
      threshold,
      packageId: normalizeSuiAddress(packageId),
      id: Buffer.from(deriveIdBytes(policyId)).toString("hex"),
      data: options.data,
    });
    if (!encryptedObject?.length) return null;
    return {
      bytes: withMarker(encryptedObject),
      encryptedObject,
      keyServerCount: HARBOR_SEAL_KEY_SERVER_OBJECT_IDS.length,
      threshold,
    };
  } catch {
    return null;
  }
}

/**
 * Encrypt bytes in native Harbor Seal format. The returned value is raw BCS
 * `EncryptedObject` bytes — deliberately without the AgentOS `SEALREAL1`
 * marker — because Harbor persists ciphertext verbatim.
 */
export async function sealEncryptHarbor(
  options: HarborSealEncryptOptions,
): Promise<Uint8Array> {
  const policyId = options.sealPolicyId.trim();
  if (!/^0x[0-9a-fA-F]{1,64}$/.test(policyId)) {
    throw new Error("Harbor Seal requires a concrete 0x seal_policy_id");
  }
  if (!options.suiClient) {
    throw new Error("Harbor Seal requires a read-only Sui client");
  }

  const sealIdentity = bcs.struct("HarborSealIdentity", {
    policyObjectId: bcs.Address,
    nonce: bcs.fixedArray(32, bcs.u8()),
  });
  const id = sealIdentity
    .serialize({
      policyObjectId: normalizeSuiAddress(policyId),
      nonce: Array.from(randomBytes(32)),
    })
    .toHex();
  const { encryptedObject } = await createSealClient(options.suiClient).encrypt({
    threshold: 2,
    packageId: HARBOR_SEAL_ORIGINAL_PACKAGE_ID,
    id,
    data: options.data,
  });
  if (!encryptedObject?.length) {
    throw new Error("Harbor Seal returned an empty encrypted object");
  }
  return encryptedObject;
}
