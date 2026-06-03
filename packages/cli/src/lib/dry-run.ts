import type { SuiClient } from '@mysten/sui/client';
import type { Transaction } from '@mysten/sui/transactions';

import type { AgentOSConfig } from '@agentos/sdk/node';

export async function formatDryRun(
  transaction: Transaction,
  suiClient: SuiClient,
  config: AgentOSConfig,
  kind: string,
): Promise<{ mode: 'dry-run'; kind: string; txBytes?: string; note: string }> {
  const packageId = config.packageId ?? process.env.AGENTOS_PACKAGE_ID;
  if (!packageId) {
    return {
      mode: 'dry-run',
      kind,
      note:
        'Transaction prepared locally. Set packageId in .agentos/config.json (or AGENTOS_PACKAGE_ID) after contracts publish to serialize bytes.',
    };
  }

  const bytes = await transaction.build({ client: suiClient });

  return {
    mode: 'dry-run',
    kind,
    txBytes: Buffer.from(bytes).toString('base64'),
    note: 'Serialized with configured packageId',
  };
}
