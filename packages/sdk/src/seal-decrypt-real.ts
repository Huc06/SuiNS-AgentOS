/**
 * REAL Mysten Seal DECRYPTION (read path). CLIENT-SIDE only.
 *
 * ---------------------------------------------------------------------------
 * Why this is NOT run by the server-side workflow engine
 * ---------------------------------------------------------------------------
 * Decrypting a Seal `EncryptedObject` is fundamentally interactive and bound to
 * the *user's wallet*. Unlike encryption (which only needs the public key-server
 * state and can run on a read-only server — see `seal-real.ts`), decryption
 * requires ALL of:
 *
 *   1. A `SessionKey` whose personal message is signed by the USER WALLET. The
 *      key servers will only hand out decryption shares to a session the user
 *      authorized; the signer-agnostic engine has no user wallet to sign with.
 *   2. A live round-trip to the Seal key servers (`KeyStore.fetchKeys`) to fetch
 *      the user's per-id secret-key shares.
 *   3. An on-chain `seal_approve` access check: the key servers dry-run the
 *      `bucket_policy::seal_approve(id, policy, ctx)` Move call (against the
 *      published AgentOS package) with the SESSION's address as the sender, and
 *      only release shares if it does not abort. The AgentOS policy asserts
 *      `policy.owner == ctx.sender()`, i.e. only the bucket owner can decrypt.
 *
 * Because of (1)–(3) this helper MUST run where the user's wallet lives — a
 * browser dApp (via `@mysten/dapp-kit`'s `signPersonalMessage`) or a Node CLI
 * holding the user's keypair. The host passes in a `signPersonalMessage`
 * callback; this module never imports a wallet, Enoki, or a private key.
 *
 * This file is exported from the Node entry (`@agentos/sdk/node`) only and is
 * NEVER imported by `src/workflow/` — the workflow engine stays signer-agnostic.
 * The AES demo round-trip (`sealDecrypt` in `seal.ts`) is kept untouched for the
 * deterministic, network-free tests; this is the genuine alternative for when a
 * real wallet + live key servers are available.
 */

import {
  getAllowlistedKeyServers,
  KeyStore,
  retrieveKeyServers,
  SessionKey,
  EncryptedObject,
} from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex, normalizeSuiAddress } from "@mysten/sui/utils";

import { isRealSeal, SEAL_REAL_MAGIC, type SealNetwork } from "./seal-real.js";

/** The read-only Sui client type the seal helpers expect (kept structural). */
type SealSuiClient = Parameters<typeof retrieveKeyServers>[0]["client"];

/**
 * A user-wallet personal-message signer. Mirrors the shape `@mysten/dapp-kit`'s
 * `useSignPersonalMessage` (or a Node `Ed25519Keypair.signPersonalMessage`)
 * returns: given the message bytes, it returns the base64 signature string. This
 * is the ONLY wallet-bound input — the module itself never touches a key.
 */
export type SignPersonalMessage = (
  message: Uint8Array,
) => Promise<{ signature: string }>;

/** Options for {@link sealDecryptReal}. */
export interface SealDecryptRealOptions {
  /**
   * The payload produced by {@link sealEncryptReal} — `SEAL_REAL_MAGIC` ++
   * BCS(`EncryptedObject`). The marker is stripped before parsing; raw
   * (unmarked) `EncryptedObject` bytes are also accepted.
   */
  data: Uint8Array;
  /**
   * The on-chain `bucket_policy::BucketPolicy` object id (`0x…`). The key
   * servers dry-run `seal_approve(id, &policy, ctx)` against it; the policy
   * asserts `owner == sender`, so only the bucket owner's session passes.
   */
  bucketPolicyId: string;
  /**
   * The published AgentOS Move package id (`0x…`) whose `bucket_policy` module
   * exposes `seal_approve`. Must match the package the object was encrypted to.
   */
  packageId: string;
  /** Read-only `SuiClient` used to fetch key-server state. Typed `unknown` (version-agnostic). */
  suiClient: unknown;
  /**
   * The USER WALLET's personal-message signer (dApp-kit `signPersonalMessage` or
   * a Node keypair's). Required: the session must be authorized by the wallet.
   */
  signPersonalMessage: SignPersonalMessage;
  /** Network whose allowlisted key servers to use. Defaults to `"testnet"`. */
  network?: SealNetwork;
  /** TSS threshold (shares needed). Defaults to the object's own threshold. */
  threshold?: number;
  /** SessionKey TTL in minutes. Defaults to 10. */
  ttlMin?: number;
}

/**
 * Strip the {@link SEAL_REAL_MAGIC} marker from a real-Seal payload, returning
 * the bare BCS `EncryptedObject` bytes. Unmarked input is returned unchanged.
 */
export function stripRealSealMarker(data: Uint8Array): Uint8Array {
  if (isRealSeal(data)) {
    return data.subarray(Buffer.from(SEAL_REAL_MAGIC, "utf8").length);
  }
  return data;
}

/**
 * Build the unsigned `seal_approve` PTB the key servers dry-run to gate share
 * release. It calls `<packageId>::bucket_policy::seal_approve(id, policy, ctx)`
 * with the encrypted object's identity `id` (as a `vector<u8>` pure arg) and the
 * shared `BucketPolicy` object. We only need its serialized bytes (no gas / no
 * sender execution) — `build({ onlyTransactionKind: true })`.
 */
async function buildSealApproveTxBytes(
  suiClient: unknown,
  packageId: string,
  bucketPolicyId: string,
  idBytes: Uint8Array,
): Promise<Uint8Array> {
  const tx = new Transaction();
  tx.moveCall({
    target: `${normalizeSuiAddress(packageId)}::bucket_policy::seal_approve`,
    arguments: [
      tx.pure.vector("u8", Array.from(idBytes)),
      tx.object(bucketPolicyId),
    ],
  });
  return tx.build({
    client: suiClient as never,
    onlyTransactionKind: true,
  });
}

/**
 * Perform a REAL `@mysten/seal` threshold DECRYPTION, client-side.
 *
 * Flow (all wallet/network-bound — see the file header for why this can't run on
 * the signer-agnostic server engine):
 *   1. Parse the `EncryptedObject` (after stripping the real-Seal marker).
 *   2. Create a `SessionKey(packageId, ttl)` and have the USER WALLET sign its
 *      personal message (the only wallet-bound step).
 *   3. Build the `bucket_policy::seal_approve` PTB → `txBytes`.
 *   4. `KeyStore.fetchKeys(...)` — round-trips to the key servers, which dry-run
 *      `seal_approve` and (if `owner == sender`) release the user's shares.
 *   5. `KeyStore.decrypt(encryptedObject)` — reconstructs the AES key from the
 *      shares and decrypts, returning the original plaintext bytes.
 *
 * Unlike `sealEncryptReal`, this DOES throw on failure: a decrypt error is a
 * real, actionable condition for the caller (wrong wallet / not the bucket owner
 * / key servers down / wrong policy) — there is no safe silent fallback for a
 * read. Callers (a dApp / CLI) surface the error to the user.
 */
export async function sealDecryptReal(
  options: SealDecryptRealOptions,
): Promise<Uint8Array> {
  const {
    data,
    bucketPolicyId,
    packageId,
    suiClient,
    signPersonalMessage,
    network = "testnet",
    threshold,
    ttlMin = 10,
  } = options;

  if (!bucketPolicyId || !/^0x[0-9a-fA-F]+$/.test(bucketPolicyId.trim())) {
    throw new Error("sealDecryptReal: bucketPolicyId must be a 0x object id");
  }
  if (!packageId || !/^0x[0-9a-fA-F]+$/.test(packageId.trim())) {
    throw new Error("sealDecryptReal: packageId must be a 0x package id");
  }

  // 1. Parse the EncryptedObject (BCS), stripping our marker if present.
  const objectBytes = stripRealSealMarker(data);
  const encryptedObject = EncryptedObject.parse(objectBytes);
  const idBytes = Uint8Array.from(encryptedObject.id);
  const packageBytes = fromHex(normalizeSuiAddress(packageId.trim()));

  // 2. The network's key servers (and their on-chain state).
  const objectIds = getAllowlistedKeyServers(network);
  const keyServers = await retrieveKeyServers({
    objectIds,
    client: suiClient as SealSuiClient,
  });
  if (!keyServers || keyServers.length === 0) {
    throw new Error("sealDecryptReal: no key servers available");
  }
  const effectiveThreshold = Math.max(
    1,
    Math.min(threshold ?? encryptedObject.threshold ?? 1, keyServers.length),
  );

  // 3. A SessionKey signed by the USER WALLET. This is the wallet-bound step:
  //    the personal message is signed by the caller-provided signer (dApp-kit /
  //    a Node keypair), authorizing the key servers to release shares to it.
  const sessionKey = new SessionKey(packageBytes, ttlMin);
  const { signature } = await signPersonalMessage(
    sessionKey.getPersonalMessage(),
  );
  sessionKey.setPersonalMessageSignature(signature);

  // 4. The seal_approve PTB the key servers dry-run before releasing shares.
  const txBytes = await buildSealApproveTxBytes(
    suiClient,
    packageId.trim(),
    bucketPolicyId.trim(),
    idBytes,
  );

  // 5. Fetch the decryption shares (this is where the on-chain seal_approve
  //    access check runs server-side) and decrypt.
  const keyStore = new KeyStore();
  await keyStore.fetchKeys({
    keyServers,
    threshold: effectiveThreshold,
    packageId: packageBytes,
    ids: [idBytes],
    txBytes,
    sessionKey,
  });

  return keyStore.decrypt(encryptedObject);
}
