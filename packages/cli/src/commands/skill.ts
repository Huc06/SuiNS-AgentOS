import { Command } from 'commander';

export const skillCommand = new Command('skill').description('Manage skills');

skillCommand
  .command('publish <file>')
  .description('Encrypt and upload a skill manifest JSON to Harbor, then register on-chain')
  .action((_file: string) => {
    console.error('Not implemented');
    process.exit(1);
  });

skillCommand
  .command('list <agentName>')
  .description('List all SkillDescriptors registered under an agent SuiNS name')
  .action((_agentName: string) => {
    console.error('Not implemented');
    process.exit(1);
  });
