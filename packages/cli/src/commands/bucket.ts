import { Command } from 'commander';

import { createCliContext } from '../lib/context.js';
import { formatDryRun } from '../lib/dry-run.js';
import { printError, printJson } from '../lib/output.js';

export const bucketCommand = new Command('bucket').description('Manage Harbor / Seal buckets');

bucketCommand
  .command('create')
  .description('Create a Seal-encrypted Harbor bucket (requires Harbor API — epic #9)')
  .option('--api-key <key>', 'Harbor API key (hbr_...)', process.env.HARBOR_API_KEY)
  .option('--dry-run', 'Print bucket policy transaction stub')
  .option('--json', 'JSON output')
  .action(async (opts: { apiKey?: string; dryRun?: boolean; json?: boolean }) => {
    const ctx = createCliContext();

    if (opts.dryRun) {
      const { transaction } = ctx.agentos.tx.createBucketPolicy({
        sealPolicyId: '0xSEAL_POLICY_PLACEHOLDER',
      });
      const result = await formatDryRun(
        transaction,
        ctx.suiClient,
        ctx.config,
        'createBucketPolicy',
      );
      if (opts.json) {
        printJson(result);
      } else {
        console.log(result.note);
        if (result.txBytes) console.log(result.txBytes);
      }
      return;
    }

    if (!opts.apiKey) {
      printError('Harbor not wired yet. Use --dry-run or set HARBOR_API_KEY (epic #9).');
    }
  });
