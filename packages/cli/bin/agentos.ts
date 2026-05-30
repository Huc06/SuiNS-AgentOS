import { program } from 'commander';
import { agentCommand } from '../src/commands/agent.js';
import { skillCommand } from '../src/commands/skill.js';
import { bucketCommand } from '../src/commands/bucket.js';

program
  .name('agentos')
  .description('SuiNS AgentOS CLI — manage agents, skills, and buckets')
  .version('0.0.1');

program.addCommand(agentCommand);
program.addCommand(skillCommand);
program.addCommand(bucketCommand);

program.parse();
