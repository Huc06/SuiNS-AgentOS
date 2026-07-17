import type { SuiGrpcClient } from "@mysten/sui/grpc";
import type { Transaction } from "@mysten/sui/transactions";

import type { AgentOSConfig } from "@agentos-sui/sdk/node";

export async function formatDryRun(
  transaction: Transaction,
  suiClient: SuiGrpcClient,
  config: AgentOSConfig,
  kind: string,
): Promise<{ mode: "dry-run"; kind: string; txBytes?: string; note: string }> {
  const packageId = config.packageId ?? process.env.AGENTOS_PACKAGE_ID;
  if (!packageId) {
    return {
      mode: "dry-run",
      kind,
      note: "Transaction prepared locally. Set packageId in .agentos/config.json (or AGENTOS_PACKAGE_ID) after contracts publish to serialize bytes.",
    };
  }

  const bytes = await transaction.build({
    client: suiClient,
    // Dry-run only serializes the transaction; it is never signed or sent.
    // A sender is required to build, so use the zero address as a placeholder
    // when the caller hasn't set one (e.g. no signer in dry-run mode).
    onlyTransactionKind: true,
  });

  return {
    mode: "dry-run",
    kind,
    txBytes: Buffer.from(bytes).toString("base64"),
    note: "Serialized with configured packageId (TransactionKind only)",
  };
}
