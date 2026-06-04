import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

import { moveTarget } from './package-id.js';

/** @deprecated Use PACKAGE_PLACEHOLDER from package-id */
export { PACKAGE_PLACEHOLDER as PACKAGE } from './package-id.js';

export function create(options: {
  skillId: string;
  walrusManifestBlob: string;
  manifestHash: string;
  mvrPackageName: string;
  version: string;
  packageId?: string;
}) {
  return (tx: Transaction): TransactionObjectArgument => {
    const encode = (value: string) => Array.from(new TextEncoder().encode(value));
    const [descriptor] = tx.moveCall({
      target: moveTarget(options.packageId, 'skill_descriptor', 'create'),
      arguments: [
        tx.pure.vector('u8', encode(options.skillId)),
        tx.pure.vector('u8', encode(options.walrusManifestBlob)),
        tx.pure.vector('u8', encode(options.manifestHash)),
        tx.pure.vector('u8', encode(options.mvrPackageName)),
        tx.pure.vector('u8', encode(options.version)),
      ],
    });
    return descriptor;
  };
}
