import { Transaction } from '@mysten/sui/transactions';

export function buildCreatePassportTx(options: {
  packageId: string;
  suinsName: string;
  runtimeWallet: string;
}): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${options.packageId}::agent_passport::create`,
    arguments: [
      tx.pure.vector('u8', Array.from(new TextEncoder().encode(options.suinsName))),
      tx.pure.address(options.runtimeWallet),
    ],
  });
  return tx;
}
