import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

import { moveTarget } from './package-id.js';

/** @deprecated Use resolveMovePackageId from package-id */
export { PACKAGE_PLACEHOLDER as PACKAGE } from './package-id.js';

export function create(options: {
  suinsName: string;
  runtimeWallet: string;
  packageId?: string;
}) {
  return (tx: Transaction): TransactionObjectArgument => {
    const [passport] = tx.moveCall({
      target: moveTarget(options.packageId, 'agent_passport', 'create'),
      arguments: [
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(options.suinsName))),
        tx.pure.address(options.runtimeWallet),
      ],
    });
    return passport;
  };
}

export function revoke(options: {
  passport: TransactionObjectArgument;
  packageId?: string;
}) {
  return (tx: Transaction) => {
    tx.moveCall({
      target: moveTarget(options.packageId, 'agent_passport', 'revoke'),
      arguments: [options.passport],
    });
  };
}
