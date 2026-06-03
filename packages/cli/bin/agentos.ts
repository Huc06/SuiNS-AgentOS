import { program } from 'commander';
import { agentCommand } from '../src/commands/agent.js';
import { bucketCommand } from '../src/commands/bucket.js';
import { initCommand } from '../src/commands/init.js';
import { mcpCommand } from '../src/commands/mcp.js';
import { skillCommand } from '../src/commands/skill.js';

program
  .name('agentos')
  .description('SuiNS AgentOS — register agents & skills after Suiperpower build')
  .version('0.0.1');

program.addCommand(initCommand);
program.addCommand(agentCommand);
program.addCommand(skillCommand);
program.addCommand(bucketCommand);
program.addCommand(mcpCommand);

program.parse();
