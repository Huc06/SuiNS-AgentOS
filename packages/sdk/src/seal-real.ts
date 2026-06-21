/**
 * REAL Mysten Seal encryption (write path), Node-only.
 *
 * ---------------------------------------------------------------------------
 * What this is (and what it is NOT)
 * ---------------------------------------------------------------------------
 * This module performs a genuine `@mysten/seal` threshold (TSS) encryption:
 * it fetches the network's allowlisted key servers, retrieves their on-chain
 * state, and runs `encrypt(...)` to produce an `EncryptedObject` whose shares
 * are sealed to the AgentOS `bucket_policy` package + a policy `id`. Only the
 * Seal key servers (gated by the on-chain `seal_approve` access check) can
 * later hand out decryption shares — there is NO symmetric key derivable from
 * the policy id alone (unlike the AES demo in `seal.ts`).
 *
 * It is the ENCRYPT (write) half only. DECRYPT is intentionally NOT here: it
 * requires a `SessionKey` signed by the *user's wallet* plus a round-trip to
 * the key servers, which is inherently client-side and signer-bound. The
 * signer-agnostic SDK / server-side workflow engine cannot do it, so this file
 * exposes encryption only.
 *
 * Because real Seal needs a live network (key-server objects fetched via a
 * read-only `SuiClient`), every failure mode — offline, missing package,
 * key-server outage — is swallowed and surfaced as `null`, so the caller can
 * cleanly fall back to the AES envelope (`sealEncrypt` in `seal.ts`) and never
 * hard-fail a run.
 *
 * This module is exported from the Node entry (`@agentos/sdk/node`) only. It is
 * NOT in the browser entry and NOT imported by `src/workflow/` — the workflow
 * engine stays signer-agnostic and reaches real Seal exclusively through an
 * injected host function (`ctx.seal`).
 */

import { createHash } from "node:crypto";

import { encrypt, getAllowlistedKeyServers, retrieveKeyServers } from "@mysten/seal";
import { fromHex, normalizeSuiAddress } from "@mysten/sui/utils";

/**
 * Marker prepended to a real-Seal payload so a future decrypt path can tell a
 * genuine `EncryptedObject` apart from the AES demo envelope (`AOSEAL1`). The
 * raw bytes after this prefix are the BCS-encoded Seal `EncryptedObject`.
 */
export const SEAL_REAL_MAGIC = "SEALREAL1";

/** Networks the allowlisted-key-server helper accepts. */
export type SealNetwork = "testnet" | "mainnet";

/** The read-only Sui client type `retrieveKeyServers` expects (internal). */
type SealSuiClient = Parameters<typeof retrieveKeyServers>[0]["client"];

/** Options for {@link sealEncryptReal}. */
export interface SealEncryptRealOptions {
  /** The bytes to encrypt (e.g. a serialized skill manifest). */
  data: Uint8Array;
  /**
   * The Seal access-policy id. Drives the `EncryptedObject`'s identity `id`
   * (the value the on-chain `seal_approve(id, ...)` check matches). Accepts a
   * `0x…` Sui address/object id (used verbatim as the identity bytes) or any
   * opaque string (hashed to a stable 32-byte id).
   */
  sealPolicyId: string;
  /**
   * Read-only `SuiClient` (a `@mysten/sui` client) used to fetch the key-server
   * objects from chain. Typed `unknown` to avoid pinning a specific
   * `@mysten/sui` client class version (the host's `SuiClient` and the one
   * `@mysten/seal` was built against may differ across minor versions — they are
   * structurally compatible at runtime). Cast to the seal client internally.
   */
  suiClient: unknown;
  /**
   * The Move package that owns the Seal access policy — the published AgentOS
   * package whose `bucket_policy` module exposes `seal_approve`. Must be a
   * concrete `0x…` package id.
   */
  packageId: string;
  /** Network whose allowlisted key servers to use. Defaults to `"testnet"`. */
  network?: SealNetwork;
  /** TSS threshold (shares needed to decrypt). Defaults to `1`. */
  threshold?: number;
}

/** What {@link sealEncryptReal} returns on success. */
export interface SealEncryptRealResult {
  /**
   * The full payload to persist: `SEAL_REAL_MAGIC` ++ BCS(`EncryptedObject`).
   * Carries the marker so a decrypt path can route real-Seal vs AES.
   */
  bytes: Uint8Array;
  /** The BCS `EncryptedObject` bytes, without the marker prefix. */
  encryptedObject: Uint8Array;
  /** How many key servers backed the encryption. */
  keyServerCount: number;
  /** The TSS threshold used. */
  threshold: number;
}

/**
 * Derive the 32-byte Seal identity `id` from a policy id. A `0x…` address/object
 * id maps to its raw bytes (left-padded to 32 by `normalizeSuiAddress`); any
 * other string is hashed (sha256) to a stable 32-byte id.
 */
function deriveIdBytes(sealPolicyId: string): Uint8Array {
  const trimmed = sealPolicyId.trim();
  if (/^0x[0-9a-fA-F]+$/.test(trimmed)) {
    try {
      return fromHex(normalizeSuiAddress(trimmed));
    } catch {
      // Fall through to the hash path on any normalization error.
    }
  }
  return new Uint8Array(createHash("sha256").update(`seal-id:${trimmed}`).digest());
}

/**
 * Prepend {@link SEAL_REAL_MAGIC} to the BCS `EncryptedObject` bytes.
 * `Buffer.concat` keeps this a plain `Uint8Array` for callers.
 */
function withMarker(encryptedObject: Uint8Array): Uint8Array {
  const magic = Buffer.from(SEAL_REAL_MAGIC, "utf8");
  return new Uint8Array(Buffer.concat([magic, Buffer.from(encryptedObject)]));
}

/**
 * Return true when `bytes` begins with the real-Seal marker — i.e. it is a
 * genuine `EncryptedObject` payload produced by {@link sealEncryptReal} rather
 * than the AES demo envelope.
 */
export function isRealSeal(bytes: Uint8Array): boolean {
  const magic = Buffer.from(SEAL_REAL_MAGIC, "utf8");
  if (bytes.length < magic.length) return false;
  return Buffer.from(bytes.subarray(0, magic.length)).equals(magic);
}

/**
 * Perform a REAL `@mysten/seal` threshold encryption.
 *
 * Steps: `getAllowlistedKeyServers(network)` → `retrieveKeyServers({objectIds,
 * client})` → `encrypt({keyServers, threshold, packageId, id, encryptionInput:
 * new AesGcm256(data)})`. Returns the `EncryptedObject` bytes (with the marker)
 * on success.
 *
 * IMPORTANT: this NEVER throws. Any failure (no network, no key servers, bad
 * package id, SDK error) resolves to `null` so the caller falls back to the AES
 * envelope and the run never hard-fails.
 */
export async function sealEncryptReal(
  options: SealEncryptRealOptions,
): Promise<SealEncryptRealResult | null> {
  try {
    const {
      data,
      sealPolicyId,
      suiClient,
      packageId,
      network = "testnet",
      threshold = 1,
    } = options;

    if (!sealPolicyId || !sealPolicyId.trim()) return null;
    if (!packageId || !/^0x[0-9a-fA-F]+$/.test(packageId.trim())) return null;
    if (!suiClient) return null;

    // 1. The network's allowlisted key-server object ids.
    const objectIds = getAllowlistedKeyServers(network);
    if (!objectIds || objectIds.length === 0) return null;

    // 2. Their on-chain state (name, url, pubkey) — read-only, needs the client.
    //    The client is typed `unknown` on our public API to stay version-agnostic;
    //    cast to the seal client type for the call (structurally compatible).
    const keyServers = await retrieveKeyServers({
      objectIds,
      client: suiClient as SealSuiClient,
    });
    if (!keyServers || keyServers.length === 0) return null;

    const effectiveThreshold = Math.max(
      1,
      Math.min(threshold, keyServers.length),
    );

    // 3. Encrypt under the AgentOS bucket_policy package + the policy identity.
    //    `AesGcm256` is the hybrid encryption input (the symmetric content layer
    //    Seal seals the key for). Loaded dynamically to keep this helper's
    //    static surface minimal and to avoid pulling the class at import time.
    const { AesGcm256 } = await import("@mysten/seal");
    const packageBytes = fromHex(normalizeSuiAddress(packageId.trim()));
    const idBytes = deriveIdBytes(sealPolicyId);

    const { encryptedObject } = await encrypt({
      keyServers,
      threshold: effectiveThreshold,
      packageId: packageBytes,
      id: idBytes,
      encryptionInput: new AesGcm256(data, new Uint8Array()),
    });

    if (!encryptedObject || encryptedObject.length === 0) return null;

    return {
      bytes: withMarker(encryptedObject),
      encryptedObject,
      keyServerCount: keyServers.length,
      threshold: effectiveThreshold,
    };
  } catch {
    // Any failure → null so the caller falls back to the AES envelope.
    return null;
  }
}
