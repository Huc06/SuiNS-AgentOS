import { Transaction } from '@mysten/sui/transactions';

export function buildCreatePassportTx(options: {
  packageId: string;
  suinsName: string;
  runtimeWallet: string;
  /** Tx signer — receives the minted passport object. */
  recipient: string;
}): Transaction {
  const tx = new Transaction();
  tx.setSender(options.recipient);

  const [passport] = tx.moveCall({
    target: `${options.packageId}::agent_passport::create`,
    arguments: [
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(options.suinsName))),
      tx.pure.address(options.runtimeWallet),
    ],
  });

  tx.transferObjects([passport], options.recipient);
  return tx;
}
