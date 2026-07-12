import { Transaction } from '@mysten/sui/transactions';

import { getAgentosPackageId } from './enoki-config';

/**
 * Build a delegation grant PTB targeting `agentos::delegation::grant`.
 */
export function buildDelegateTx(options: {
  parentPassportId: string;
  childAgent: string;
  allowedSkills: string[];
  allowedCapabilities: string[];
  spendLimit: bigint;
  expiryMs: bigint;
}): Transaction {
  const packageId = getAgentosPackageId();
  if (!packageId) {
    throw new Error('AgentOS package ID not configured');
  }

  const tx = new Transaction();
  const encode = (value: string) => Array.from(new TextEncoder().encode(value));

  const encodedSkills = options.allowedSkills.map((s) => encode(s));
  const encodedCaps = options.allowedCapabilities.map((c) => encode(c));

  const [cap] = tx.moveCall({
    target: `${packageId}::delegation::grant`,
    arguments: [
      tx.object(options.parentPassportId),
      tx.pure.address(options.childAgent),
      tx.pure.vector('vector<u8>', encodedSkills),
      tx.pure.vector('vector<u8>', encodedCaps),
      tx.pure.u64(options.spendLimit),
      tx.pure.u64(options.expiryMs),
    ],
  });

  // Transfer the cap to the child agent
  tx.transferObjects([cap], options.childAgent);

  return tx;
}

/**
 * Build a PTB to revoke a DelegationCap on-chain.
 * The cap must be owned by the transaction sender.
 */
export function buildRevokeTx(options: { capId: string }): Transaction {
  const packageId = getAgentosPackageId();
  if (!packageId) {
    throw new Error('AgentOS package ID not configured');
  }
  const tx = new Transaction();
  tx.moveCall({
    target: `${packageId}::delegation::revoke`,
    arguments: [tx.object(options.capId)],
  });
  return tx;
}
