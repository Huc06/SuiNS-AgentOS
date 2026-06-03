import { Command } from 'commander';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { SEED_REGISTRY } from '@agentos/sdk/node';

function findBridgeSkillsDir(start = process.cwd()): string | null {
  let dir = start;
  for (let i = 0; i < 8; i++) {
    const candidate = join(dir, 'skills', 'agentos');
    if (existsSync(candidate)) return candidate;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export const initCommand = new Command('init')
  .description('Initialize AgentOS in the current project (config, registry, bridge skills, MCP hint)')
  .option('--vendor', 'Copy bridge skills into .cursor/rules/agentos/')
  .option('--no-seed', 'Start with an empty registry instead of demo data')
  .action((opts: { vendor?: boolean; noSeed?: boolean }) => {
    const cwd = process.cwd();
    const agentosDir = join(cwd, '.agentos');
    mkdirSync(agentosDir, { recursive: true });

    const configPath = join(agentosDir, 'config.json');
    if (!existsSync(configPath)) {
      writeFileSync(
        configPath,
        `${JSON.stringify(
          {
            network: 'testnet',
            dashboardUrl: 'http://localhost:3000',
            registryPath: join(agentosDir, 'registry.json'),
          },
          null,
          2,
        )}\n`,
      );
    }

    const registryPath = join(agentosDir, 'registry.json');
    if (!existsSync(registryPath)) {
      const data = opts.noSeed
        ? { version: 1 as const, agents: [], skills: [] }
        : SEED_REGISTRY;
      writeFileSync(registryPath, `${JSON.stringify(data, null, 2)}\n`);
    }

    const skillsSrc = findBridgeSkillsDir(cwd);
    if (opts.vendor && skillsSrc) {
      const dest = join(cwd, '.cursor', 'rules', 'agentos');
      mkdirSync(dest, { recursive: true });
      cpSync(skillsSrc, dest, { recursive: true });
      console.log(`Copied bridge skills → ${dest}`);
    }

    const mcpSnippet = {
      mcpServers: {
        agentos: {
          command: 'npx',
          args: ['-y', '@agentos/mcp'],
          env: {
            AGENTOS_REGISTRY_PATH: registryPath,
          },
        },
      },
    };

    console.log('\nAgentOS initialized.\n');
    console.log(`  Config:    ${configPath}`);
    console.log(`  Registry:  ${registryPath}`);
    console.log('\nAdd to Cursor MCP settings (~/.cursor/mcp.json or project .cursor/mcp.json):\n');
    console.log(JSON.stringify(mcpSnippet, null, 2));
    console.log('\nAfter Suiperpower deploy:');
    console.log('  agentos agent create my-agent.sui --wallet <address>');
    console.log('  agentos skill publish ./skill.json --agent my-agent.sui');
    console.log('\nStart MCP: agentos mcp\n');
  });
