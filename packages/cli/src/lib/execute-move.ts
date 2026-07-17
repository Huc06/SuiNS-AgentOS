import type { SuiGrpcClient } from "@mysten/sui/grpc";
import type { Signer } from "@mysten/sui/cryptography";
import type { Transaction } from "@mysten/sui/transactions";

export async function executeTransaction(options: {
  transaction: Transaction;
  suiClient: SuiGrpcClient;
  signer: Signer;
}): Promise<{ digest: string }> {
  const bytes = await options.transaction.build({ client: options.suiClient });
  const { signature } = await options.signer.signTransaction(bytes);
  const result = await options.suiClient.executeTransaction({
    transaction: bytes,
    signatures: [signature],
    include: { effects: true },
  });
  return { digest: (result as unknown as { digest: string }).digest };
}
