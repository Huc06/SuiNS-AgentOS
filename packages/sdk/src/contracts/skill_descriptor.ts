import { Transaction } from '@mysten/sui/transactions';
import type { TransactionObjectArgument } from '@mysten/sui/transactions';

/** MVR package name — replace with @mysten/codegen output when wired up. */
export const PACKAGE = '@agentos/contracts' as const;

export function create(options: {
  skillId: string;
  walrusManifestBlob: string;
  manifestHash: string;
  mvrPackageName: string;
  version: string;
}) {
  return (tx: Transaction): TransactionObjectArgument => {
    const encode = (value: string) => Array.from(new TextEncoder().encode(value));
    const [descriptor] = tx.moveCall({
      target: `${PACKAGE}::skill_descriptor::create`,
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
