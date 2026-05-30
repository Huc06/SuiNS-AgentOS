import { Command } from 'commander';

export const bucketCommand = new Command('bucket').description('Manage Harbor buckets');

bucketCommand
  .command('create')
  .description('Create a Seal-encrypted Harbor bucket and print its bucketId')
  .requiredOption('--api-key <key>', 'Harbor API key (hbr_...)')
  .action((_options: { apiKey: string }) => {
    console.error('Not implemented');
    process.exit(1);
  });
