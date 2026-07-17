/** Real Mysten Seal decryption helper (Node/browser caller supplied signer). */

import { EncryptedObject, SealClient, SessionKey } from "@mysten/seal";
import { Transaction } from "@mysten/sui/transactions";
import { fromHex, normalizeSuiAddress } from "@mysten/sui/utils";

import {
  HARBOR_SEAL_KEY_SERVER_OBJECT_IDS,
  isRealSeal,
  SEAL_REAL_MAGIC,
} from "./seal-real.js";

export type SignPersonalMessage = (
  message: Uint8Array,
) => Promise<{ signature: string }>;

export interface SealDecryptRealOptions {
  /** Marked AgentOS or raw BCS EncryptedObject ciphertext. */
  data: Uint8Array;
  bucketPolicyId: string;
  packageId: string;
  /** Wallet address which the bucket policy authorizes. */
  userAddress: string;
  /** SuiGrpcClient or Seal-compatible Sui client. */
  suiClient: unknown;
  signPersonalMessage: SignPersonalMessage;
  threshold?: number;
  ttlMin?: number;
}

export function stripRealSealMarker(data: Uint8Array): Uint8Array {
  if (isRealSeal(data)) {
    return data.subarray(Buffer.from(SEAL_REAL_MAGIC, "utf8").length);
  }
  return data;
}

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
  return tx.build({ client: suiClient as never, onlyTransactionKind: true });
}

/**
 * Decrypt a real Seal object after a caller-provided wallet authorizes a
 * short-lived SessionKey. This helper never handles a user private key.
 */
export async function sealDecryptReal(
  options: SealDecryptRealOptions,
): Promise<Uint8Array> {
  const {
    data,
    bucketPolicyId,
    packageId,
    userAddress,
    suiClient,
    signPersonalMessage,
    ttlMin = 10,
  } = options;
  if (!/^0x[0-9a-fA-F]+$/.test(bucketPolicyId.trim())) {
    throw new Error("sealDecryptReal: bucketPolicyId must be a 0x object id");
  }
  if (!/^0x[0-9a-fA-F]+$/.test(packageId.trim())) {
    throw new Error("sealDecryptReal: packageId must be a 0x package id");
  }
  if (!/^0x[0-9a-fA-F]+$/.test(userAddress.trim())) {
    throw new Error("sealDecryptReal: userAddress must be a 0x wallet address");
  }

  const ciphertext = stripRealSealMarker(data);
  const encryptedObject = EncryptedObject.parse(ciphertext);
  const rawId: unknown = encryptedObject.id;
  const idBytes =
    rawId instanceof Uint8Array
      ? rawId
      : Array.isArray(rawId)
        ? Uint8Array.from(rawId)
        : fromHex(
            String(rawId).startsWith("0x")
              ? String(rawId)
              : `0x${String(rawId)}`,
          );
  const txBytes = await buildSealApproveTxBytes(
    suiClient,
    packageId.trim(),
    bucketPolicyId.trim(),
    idBytes,
  );

  const sessionKey = await SessionKey.create({
    address: normalizeSuiAddress(userAddress.trim()),
    packageId: normalizeSuiAddress(packageId.trim()),
    ttlMin,
    suiClient: suiClient as never,
  });
  const { signature } = await signPersonalMessage(sessionKey.getPersonalMessage());
  await sessionKey.setPersonalMessageSignature(signature);

  const seal = new SealClient({
    suiClient: suiClient as never,
    serverConfigs: HARBOR_SEAL_KEY_SERVER_OBJECT_IDS.map((objectId) => ({
      objectId,
      weight: 1,
    })),
    verifyKeyServers: false,
  });
  return seal.decrypt({
    data: ciphertext,
    sessionKey,
    txBytes,
    ...(options.threshold ? { checkShareConsistency: true } : {}),
  });
}
