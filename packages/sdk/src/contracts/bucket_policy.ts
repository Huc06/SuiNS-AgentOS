import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

/** MVR package name — replace with @mysten/codegen output when wired up. */
export const PACKAGE = '@agentos/contracts' as const;

export function create(options: { sealPolicyId: string }) {
  return (tx: Transaction): TransactionObjectArgument => {
    const [policy] = tx.moveCall({
      target: `${PACKAGE}::bucket_policy::create`,
      arguments: [tx.pure.address(options.sealPolicyId)],
    });
    return policy;
  };
}

export function sealApprove(options: {
  id: string;
  policy: TransactionObjectArgument;
}) {
  return (tx: Transaction) => {
    tx.moveCall({
      target: `${PACKAGE}::bucket_policy::seal_approve`,
      arguments: [
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(options.id))),
        options.policy,
      ],
    });
  };
}
