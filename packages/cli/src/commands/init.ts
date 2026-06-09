import { Command } from 'commander';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SEED_REGISTRY } from '@agentos/sdk/node';

export const initCommand = new Command('init')
  .description('Initialize AgentOS registry + config (use alongside Suiperpower — no separate skill pack)')
  .option('--no-seed', 'Start with an empty registry instead of demo data')
  .action((opts: { noSeed?: boolean }) => {
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
    console.log('\nBuild with Suiperpower (/suiper:* skills). Register with AgentOS:');
    console.log('  CLI:  agentos agent create <name.sui> --wallet <0x...>');
    console.log('        agentos skill publish ./manifest.json --agent <name.sui>');
    console.log('  MCP:  add agentos server (below) — agent invokes tools after Suiperpower deploy');
    console.log('\n~/.cursor/mcp.json or .cursor/mcp.json:\n');
    console.log(JSON.stringify(mcpSnippet, null, 2));
    console.log('\n  agentos mcp   # stdio server\n');
  });
