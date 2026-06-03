import { Command } from 'commander';

import { createCliContext } from '../lib/context.js';
import { formatDryRun } from '../lib/dry-run.js';
import { readManifestFile } from '../lib/manifest.js';
import { printError, printJson } from '../lib/output.js';

export const skillCommand = new Command('skill').description('Manage skills');

skillCommand
  .command('publish <file>')
  .description('Register a skill manifest (local registry; Walrus + on-chain when configured)')
  .requiredOption('--agent <name>', 'Target agent SuiNS name')
  .option('--walrus <blobId>', 'Walrus manifest blob id or URL')
  .option('--dry-run', 'Print Move transaction for SkillDescriptor::create')
  .option('--json', 'JSON output')
  .action(
    async (
      file: string,
      opts: { agent: string; walrus?: string; dryRun?: boolean; json?: boolean },
    ) => {
      const ctx = createCliContext();
      let manifest;
      try {
        manifest = readManifestFile(file);
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }

      if (opts.dryRun) {
        const walrus = opts.walrus ?? `walrus://pending/${manifest.name}`;
        const hash = `0x${manifest.name}-hash`;
        const { transaction } = ctx.agentos.tx.createSkillDescriptor({
          skillId: manifest.name,
          walrusManifestBlob: walrus,
          manifestHash: hash,
          mvrPackageName: manifest.publisher,
          version: manifest.version,
        });
        const result = await formatDryRun(
          transaction,
          ctx.suiClient,
          ctx.config,
          'createSkillDescriptor',
        );
        if (opts.json) {
          printJson(result);
        } else {
          console.log(result.note);
          if (result.txBytes) console.log(result.txBytes);
        }
        return;
      }

      try {
        const record = ctx.registry.publishSkill({
          agentName: opts.agent,
          manifest,
          walrusManifestBlob: opts.walrus,
        });
        const dashboard = `${ctx.config.dashboardUrl ?? 'http://localhost:3000'}/agent/${record.agentSlug}`;
        if (opts.json) {
          printJson({ skill: record, dashboardUrl: dashboard });
        } else {
          console.log(`Published ${record.mvrPackage} ${record.version}`);
          console.log(`  Object:   ${record.objectId}`);
          console.log(`  Walrus:   ${record.walrusManifestBlob}`);
          console.log(`  Manage:   ${dashboard}`);
        }
      } catch (e) {
        printError(e instanceof Error ? e.message : String(e));
      }
    },
  );

skillCommand
  .command('list <agentName>')
  .description('List skills registered under an agent')
  .option('--json', 'JSON output')
  .action((agentName: string, opts: { json?: boolean }) => {
    const ctx = createCliContext();
    const skills = ctx.registry.listSkills(agentName);
    if (!skills.length) {
      const resolved = ctx.registry.resolveAgent(agentName);
      if (!resolved) printError(`Agent not found: ${agentName}`);
    }
    if (opts.json) {
      printJson({ agent: agentName, skills });
    } else {
      for (const s of skills) {
        console.log(`${s.mvrPackage}  ${s.version}  [${s.network}]  ${s.status}`);
      }
    }
  });
