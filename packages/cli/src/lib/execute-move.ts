import type { SuiGrpcClient } from "@mysten/sui/grpc";
import type { Signer } from "@mysten/sui/cryptography";
import type { Transaction } from "@mysten/sui/transactions";

export async function executeTransaction(options: {
  transaction: Transaction;
  suiClient: SuiGrpcClient;
  signer: Signer;
}): Promise<{ digest: string }> {
  // The CLI signs+submits directly (no gas-sponsorship layer to set this for
  // us), so ensure the transaction has a sender before building — otherwise
  // `build()` throws "Missing transaction sender". `setSenderIfNotSet` is a
  // no-op if a caller already set a different sender on purpose.
  options.transaction.setSenderIfNotSet(options.signer.toSuiAddress());
  const bytes = await options.transaction.build({ client: options.suiClient });
  const { signature } = await options.signer.signTransaction(bytes);
  const result = await options.suiClient.executeTransaction({
    transaction: bytes,
    signatures: [signature],
    include: { effects: true },
  });
  return { digest: (result as unknown as { digest: string }).digest };
}
