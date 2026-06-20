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

/**
 * Bind an AgentPassport's memory namespace on-chain. Mirrors the Move
 * `set_memory_namespace(passport: &mut AgentPassport, namespace: vector<u8>, ctx)`
 * — only the owner can call it (enforced by the contract).
 */
export function setMemoryNamespace(options: {
  passport: TransactionObjectArgument;
  namespace: string;
  packageId?: string;
}) {
  return (tx: Transaction) => {
    tx.moveCall({
      target: moveTarget(options.packageId, 'agent_passport', 'set_memory_namespace'),
      arguments: [
        options.passport,
        tx.pure.vector('u8', Array.from(new TextEncoder().encode(options.namespace))),
      ],
    });
  };
}

/**
 * Record a skill execution against an AgentPassport, bumping its `exec_count`.
 * The Move `record_execution(passport: &mut AgentPassport, ctx)` only takes the
 * passport; `ctx` is injected by the runtime, so the only PTB argument is the
 * passport object.
 */
export function recordExecution(options: {
  passport: TransactionObjectArgument;
  packageId?: string;
}) {
  return (tx: Transaction) => {
    tx.moveCall({
      target: moveTarget(options.packageId, 'agent_passport', 'record_execution'),
      arguments: [options.passport],
    });
  };
}
