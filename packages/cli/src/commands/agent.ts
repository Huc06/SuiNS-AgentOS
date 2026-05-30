import { Command } from 'commander';

export const agentCommand = new Command('agent').description('Manage agents');

agentCommand
  .command('create <name>')
  .description('Create a new agent with a SuiNS name')
  .action((_name: string) => {
    console.error('Not implemented');
    process.exit(1);
  });

agentCommand
  .command('resolve <name>')
  .description('Resolve an agent by SuiNS name and print its passport')
  .action((_name: string) => {
    console.error('Not implemented');
    process.exit(1);
  });
