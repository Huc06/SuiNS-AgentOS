import { Command } from 'commander';

import { resolvePackageId } from '@agentos/sdk/node';

import { createCliContext } from '../lib/context.js';
import { formatDryRun } from '../lib/dry-run.js';
import { executeTransaction } from '../lib/execute-move.js';
import { printError, printJson } from '../lib/output.js';

export const agentCommand = new Command('agent').description('Manage agents');

agentCommand
  .command('create <name>')
  .description('Register an agent passport (local registry; on-chain when packageId is set)')
  .requiredOption('--wallet <address>', 'Runtime wallet address')
  .option('--network <network>', 'mainnet | testnet', 'testnet')
  .option('--dry-run', 'Print Move transaction instead of registering locally')
  .option('--on-chain', 'Sign and execute agent_passport::create (requires packageId + SUI_PRIVATE_KEY)')
  .option('--json', 'JSON output')
  .action(
    async (
      name: string,
      opts: { wallet: string; network: string; dryRun?: boolean; onChain?: boolean; json?: boolean },
    ) => {
    const ctx = createCliContext();

    if (opts.dryRun) {
      const { transaction } = ctx.agentos.tx.createAgent({
        suinsName: name,
        runtimeWallet: opts.wallet,
      });
      const result = await formatDryRun(transaction, ctx.suiClient, ctx.config, 'createAgent');
      if (opts.json) {
        printJson(result);
      } else {
        console.log(result.note);
        if (result.txBytes) console.log(result.txBytes);
      }
      return;
    }

    if (opts.onChain) {
      const packageId = resolvePackageId(ctx.config);
      if (!packageId) {
        printError('Set packageId in .agentos/config.json or AGENTOS_PACKAGE_ID after publish.');
        return;
      }
      const signer = ctx.getSigner();
      if (!signer) {
        printError('Set SUI_PRIVATE_KEY or AGENTOS_PRIVATE_KEY to sign on-chain transactions.');
        return;
      }
      try {
        const { transaction } = ctx.agentos.tx.createAgent({
          suinsName: name,
          runtimeWallet: opts.wallet,
        });
        const { digest } = await executeTransaction({
          transaction,
          suiClient: ctx.suiClient,
          signer,
        });
        if (opts.json) {
          printJson({ digest, packageId });
        } else {
          console.log(`On-chain create submitted: ${digest}`);
        }
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }
      return;
    }

    try {
      const record = ctx.registry.registerAgent({
        suinsName: name,
        runtimeWallet: opts.wallet,
        network: opts.network === 'mainnet' ? 'mainnet' : 'testnet',
      });
      const dashboard = `${ctx.config.dashboardUrl ?? 'http://localhost:3000'}/agent/${record.slug}`;
      if (opts.json) {
        printJson({ agent: record, dashboardUrl: dashboard });
      } else {
        console.log(`Registered @${record.suinsName}`);
        console.log(`  Passport:  ${record.passportId}`);
        console.log(`  Dashboard: ${dashboard}`);
        console.log(`  Registry:  ${ctx.registryPath}`);
      }
    } catch (e) {
      printError(e instanceof Error ? e.message : String(e));
    }
    },
  );

agentCommand
  .command('resolve <name>')
  .description('Resolve an agent by SuiNS name')
  .option('--json', 'JSON output')
  .action((name: string, opts: { json?: boolean }) => {
    const ctx = createCliContext();
    const resolved = ctx.registry.resolveAgent(name);
    if (!resolved) {
      printError(`Agent not found: ${name}`);
    }
    if (opts.json) {
      printJson(resolved);
    } else {
      console.log(`Agent: ${resolved.agent.suinsName}`);
      console.log(`  Status:   ${resolved.agent.status}`);
      console.log(`  Passport: ${resolved.agent.passportId}`);
      console.log(`  Skills:   ${resolved.skills.length}`);
      for (const s of resolved.skills) {
        console.log(`    - ${s.mvrPackage} (${s.version})`);
      }
    }
  });

agentCommand
  .command('list')
  .description('List all registered agents')
  .option('--json', 'JSON output')
  .action((opts: { json?: boolean }) => {
    const ctx = createCliContext();
    const agents = ctx.registry.listAgents();
    if (opts.json) {
      printJson({ agents });
    } else {
      for (const a of agents) {
        console.log(`${a.suinsName}  ${a.passportVersion}  [${a.network}]  ${a.status}`);
      }
    }
  });
