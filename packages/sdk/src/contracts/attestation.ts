import { Transaction } from "@mysten/sui/transactions";
import type { TransactionObjectArgument } from "@mysten/sui/transactions";

import { moveTarget, resolveMovePackageId } from "./package-id.js";

/** The well-known Sui shared `Clock` object id (`0x6`). */
export const SUI_CLOCK_OBJECT_ID =
  "0x0000000000000000000000000000000000000000000000000000000000000006";

/**
 * Build an `agentos::attestation::attest` move call.
 *
 * `attest(subject, attester_passport, kind, score, uri, clock, ctx) ->
 * Attestation` returns an owned `Attestation`. The transaction sender must be
 * the OWNER or RUNTIME_WALLET of `attesterPassport` (their own passport,
 * proving they are a registered agent) — an arbitrary address cannot attest.
 * The attester's passport must be active, and it must not be the same object
 * as `subjectPassport` (self-attestation is rejected on-chain).
 *
 * A PTB will fail to build/execute if a returned value is left dangling, so
 * this builder always consumes it: it `transferObjects` the attestation to
 * `recipient`, or — when `share` is set (and no recipient) — makes it a
 * shared object via `0x2::transfer::public_share_object`.
 *
 * Pass either `clockId` (defaults to `0x6`) by reference.
 */
export function attest(options: {
  /** The subject AgentPassport object being attested. */
  subjectPassport: TransactionObjectArgument;
  /** The attester's OWN AgentPassport (proves they're a registered agent). */
  attesterPassport: TransactionObjectArgument;
  /** Attestation category, e.g. "review" / "audit" (stored as bytes). */
  kind: string;
  /** Reputation score, 0..=100 (enforced on-chain). */
  score: number;
  /** Off-chain pointer (e.g. a Walrus blob id or URL), stored as bytes. */
  uri: string;
  /** The Clock object id. Defaults to the shared `0x6` Clock. */
  clockId?: string;
  /** Address to receive the produced Attestation. Mutually exclusive with `share`. */
  recipient?: string;
  /** When true (and no `recipient`), share the Attestation instead of transferring it. */
  share?: boolean;
  packageId?: string;
}) {
  return (tx: Transaction): TransactionObjectArgument => {
    const encode = (value: string) =>
      Array.from(new TextEncoder().encode(value));

    if (options.score < 0 || options.score > 100) {
      throw new Error(
        `attestation score out of range: ${options.score} (must be 0..=100)`,
      );
    }
    if (!options.recipient && !options.share) {
      throw new Error(
        "attest requires either a `recipient` (transfer) or `share: true`",
      );
    }

    const clock = tx.object(options.clockId ?? SUI_CLOCK_OBJECT_ID);

    const [attestation] = tx.moveCall({
      target: moveTarget(options.packageId, "attestation", "attest"),
      arguments: [
        options.subjectPassport,
        options.attesterPassport,
        tx.pure.vector("u8", encode(options.kind)),
        tx.pure.u8(options.score),
        tx.pure.vector("u8", encode(options.uri)),
        clock,
      ],
    });

    if (options.recipient) {
      tx.transferObjects([attestation], options.recipient);
    } else {
      // Share the owned Attestation so it is not left dangling.
      tx.moveCall({
        target: "0x2::transfer::public_share_object",
        typeArguments: [
          `${resolveMovePackageId(options.packageId)}::attestation::Attestation`,
        ],
        arguments: [attestation],
      });
    }

    return attestation;
  };
}
