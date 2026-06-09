import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

import { moveTarget } from './package-id.js';

/** @deprecated Use PACKAGE_PLACEHOLDER from package-id */
export { PACKAGE_PLACEHOLDER as PACKAGE } from './package-id.js';

export function create(options: { sealPolicyId: string; packageId?: string }) {
  return (tx: Transaction): TransactionObjectArgument => {
    const [policy] = tx.moveCall({
      target: moveTarget(options.packageId, 'bucket_policy', 'create'),
      arguments: [tx.pure.address(options.sealPolicyId)],
    });
    return policy;
  };
}

export function sealApprove(options: {
  id: string;
  policy: TransactionObjectArgument;
  packageId?: string;
}) {
  return (tx: Transaction) => {
    tx.moveCall({
      target: moveTarget(options.packageId, 'bucket_policy', 'seal_approve'),
      arguments: [
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(options.id))),
        options.policy,
      ],
    });
  };
}
