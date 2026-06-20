import { EnokiClient } from "@mysten/enoki";
import { getFullnodeUrl, SuiClient } from "@mysten/sui/client";
import { decodeSuiPrivateKey } from "@mysten/sui/cryptography";
import { Ed25519Keypair } from "@mysten/sui/keypairs/ed25519";
import type { Transaction } from "@mysten/sui/transactions";
import { fromBase64, toBase64 } from "@mysten/sui/utils";

import { getSuiNetwork } from "./enoki-config";

/** Minimal object-change shape extracted from the executed transaction. */
export interface SponsoredObjectChange {
  type: string;
  objectId: string;
  objectType?: string;
}

export interface SponsoredExecuteResult {
  digest: string;
  effects?: unknown;
  objectChanges?: SponsoredObjectChange[];
}

let cachedKeypair: Ed25519Keypair | null = null;
let cachedSuiClient: SuiClient | null = null;

/**
 * Server-side runtime keypair decoded from `SUI_PRIVATE_KEY`.
 * This keypair is the *sender* of every sponsored transaction (Enoki pays gas).
 * It must NEVER be exposed to the browser.
 */
export function getRuntimeKeypair(): Ed25519Keypair {
  if (cachedKeypair) return cachedKeypair;
  const raw = process.env.SUI_PRIVATE_KEY?.trim();
  if (!raw) {
    throw new Error(
      "SUI_PRIVATE_KEY is not set — required to sign sponsored transactions server-side.",
    );
  }
  const { secretKey } = decodeSuiPrivateKey(raw);
  cachedKeypair = Ed25519Keypair.fromSecretKey(secretKey);
  return cachedKeypair;
}

/** Sui address of the runtime keypair (the sponsored transaction sender). */
export function getRuntimeAddress(): string {
  return getRuntimeKeypair().toSuiAddress();
}

/** Enoki client used for gas sponsorship. Requires `ENOKI_SECRET_KEY`. */
export function getEnokiClient(): EnokiClient {
  const apiKey = process.env.ENOKI_SECRET_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      "ENOKI_SECRET_KEY is not set — required for Enoki gas sponsorship.",
    );
  }
  return new EnokiClient({ apiKey });
}

function getSuiClient(): SuiClient {
  if (cachedSuiClient) return cachedSuiClient;
  cachedSuiClient = new SuiClient({ url: getFullnodeUrl(getSuiNetwork()) });
  return cachedSuiClient;
}

/**
 * Execute a transaction fully gasless, server-side:
 *   1. build `onlyTransactionKind` bytes,
 *   2. wrap them with Enoki-sponsored gas (sender = runtime keypair),
 *   3. sign the sponsored bytes with the runtime keypair,
 *   4. submit via Enoki,
 *   5. fetch effects + objectChanges from the fullnode.
 *
 * No browser wallet, no popup, no allowlist. Throws a descriptive error when
 * `SUI_PRIVATE_KEY` or `ENOKI_SECRET_KEY` are missing (callers may catch this
 * and fall back to a non-chain code path).
 */
export async function sponsoredExecuteServer(
  tx: Transaction,
): Promise<SponsoredExecuteResult> {
  const keypair = getRuntimeKeypair();
  const sender = keypair.toSuiAddress();
  const enoki = getEnokiClient();
  const client = getSuiClient();
  const network = getSuiNetwork();

  // 1. Build the transaction kind (no gas data) so Enoki can sponsor it.
  const kindBytes = await tx.build({
    client: client as never,
    onlyTransactionKind: true,
  });

  // 2. Ask Enoki to wrap it with sponsored gas for our runtime sender.
  const sponsored = await enoki.createSponsoredTransaction({
    network,
    transactionKindBytes: toBase64(kindBytes),
    sender,
  });

  // 3. Sign the sponsored bytes with the runtime keypair.
  const { signature } = await keypair.signTransaction(
    fromBase64(sponsored.bytes),
  );

  // 4. Submit via Enoki (gas is paid by the sponsor).
  const executed = await enoki.executeSponsoredTransaction({
    digest: sponsored.digest,
    signature,
  });

  // 5. Enoki only returns the digest — fetch effects + objectChanges ourselves.
  try {
    const result = await client.waitForTransaction({
      digest: executed.digest,
      options: { showEffects: true, showObjectChanges: true },
    });

    const objectChanges = (result.objectChanges ?? [])
      .map((change): SponsoredObjectChange | undefined => {
        if ("objectId" in change && change.objectId) {
          return {
            type: change.type,
            objectId: change.objectId,
            objectType:
              "objectType" in change ? change.objectType : undefined,
          };
        }
        return undefined;
      })
      .filter((c): c is SponsoredObjectChange => c !== undefined);

    return {
      digest: executed.digest,
      effects: result.effects ?? undefined,
      objectChanges,
    };
  } catch {
    // Transaction was submitted; effects fetch failed (e.g. indexer lag).
    return { digest: executed.digest };
  }
}
