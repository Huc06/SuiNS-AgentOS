import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

/** MVR package name — replace with @mysten/codegen output when wired up. */
export const PACKAGE = '@agentos/contracts' as const;

export function create(options: { suinsName: string; runtimeWallet: string }) {
  return (tx: Transaction): TransactionObjectArgument => {
    const [passport] = tx.moveCall({
      target: `${PACKAGE}::agent_passport::create`,
      arguments: [
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(options.suinsName))),
        tx.pure.address(options.runtimeWallet),
      ],
    });
    return passport;
  };
}

export function revoke(options: { passport: TransactionObjectArgument }) {
  return (tx: Transaction) => {
    tx.moveCall({
      target: `${PACKAGE}::agent_passport::revoke`,
      arguments: [options.passport],
    });
  };
}
