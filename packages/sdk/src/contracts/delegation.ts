import { Transaction } from "@mysten/sui/transactions";
import type { TransactionObjectArgument } from "@mysten/sui/transactions";

import { moveTarget } from "./package-id.js";

/**
 * Build a `agentos::delegation::grant` move call.
 * Returns the DelegationCap object created in the transaction.
 */
export function grant(options: {
  /** The parent AgentPassport object (must be owned by sender). */
  parentPassport: TransactionObjectArgument;
  /** Address of the child/sub-agent receiving the delegation. */
  childAgent: string;
  /** Skill IDs the child is allowed to execute. Empty = all. */
  allowedSkills: string[];
  /** Capability tags granted to the child. */
  allowedCapabilities: string[];
  /** Maximum spend in MIST the child can consume. */
  spendLimit: bigint;
  /** Expiry timestamp in milliseconds (epoch ms). */
  expiryMs: bigint;
  packageId?: string;
}) {
  return (tx: Transaction): TransactionObjectArgument => {
    const encode = (value: string) =>
      Array.from(new TextEncoder().encode(value));

    const encodedSkills = options.allowedSkills.map((s) => encode(s));
    const encodedCaps = options.allowedCapabilities.map((c) => encode(c));

    const [cap] = tx.moveCall({
      target: moveTarget(options.packageId, "delegation", "grant"),
      arguments: [
        options.parentPassport,
        tx.pure.address(options.childAgent),
        tx.pure.vector("vector<u8>", encodedSkills),
        tx.pure.vector("vector<u8>", encodedCaps),
        tx.pure.u64(options.spendLimit),
        tx.pure.u64(options.expiryMs),
      ],
    });
    return cap;
  };
}

/**
 * Build a `agentos::delegation::revoke` move call.
 * Only the parent owner can revoke.
 */
export function revoke(options: {
  /** The DelegationCap object to revoke. */
  cap: TransactionObjectArgument;
  packageId?: string;
}) {
  return (tx: Transaction): void => {
    tx.moveCall({
      target: moveTarget(options.packageId, "delegation", "revoke"),
      arguments: [options.cap],
    });
  };
}

/**
 * Build a `agentos::delegation::consume` move call.
 * Deducts spend from the cap's budget.
 */
export function consume(options: {
  /** The DelegationCap object. */
  cap: TransactionObjectArgument;
  /** Amount in MIST to consume. */
  amount: bigint;
  packageId?: string;
}) {
  return (tx: Transaction): void => {
    tx.moveCall({
      target: moveTarget(options.packageId, "delegation", "consume"),
      arguments: [options.cap, tx.pure.u64(options.amount)],
    });
  };
}

/**
 * Build a `agentos::delegation::assert_valid` move call.
 * Validates the cap is not revoked/expired and the skill is allowed.
 */
export function assertValid(options: {
  cap: TransactionObjectArgument;
  clock: TransactionObjectArgument;
  skillId: string;
  packageId?: string;
}) {
  return (tx: Transaction): void => {
    const encode = (value: string) =>
      Array.from(new TextEncoder().encode(value));
    tx.moveCall({
      target: moveTarget(options.packageId, "delegation", "assert_valid"),
      arguments: [
        options.cap,
        options.clock,
        tx.pure.vector("u8", encode(options.skillId)),
      ],
    });
  };
}
