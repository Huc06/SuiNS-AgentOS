import type { SuiClient } from "@mysten/sui/client";
import type { Signer } from "@mysten/sui/cryptography";
import type { Transaction } from "@mysten/sui/transactions";

export async function executeTransaction(options: {
  transaction: Transaction;
  suiClient: SuiClient;
  signer: Signer;
}): Promise<{ digest: string }> {
  const bytes = await options.transaction.build({ client: options.suiClient });
  const { signature } = await options.signer.signTransaction(bytes);
  const result = await options.suiClient.executeTransactionBlock({
    transactionBlock: bytes,
    signature,
    options: { showEffects: true, showEvents: true },
  });
  return { digest: result.digest };
}
