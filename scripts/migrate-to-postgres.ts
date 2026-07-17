#!/usr/bin/env npx tsx
/**
 * One-time migration: copy the existing `.agentos/registry.json` into a
 * Postgres database (Neon / Vercel Postgres), for switching a deployment from
 * STORAGE_BACKEND=file (or memory) to STORAGE_BACKEND=postgres.
 *
 * Re-runs do not create duplicate records: skills/workflows are upserted; this
 * script adds only missing memory namespaces and delegation records. Existing
 * agent/delegation fields are deliberately left intact rather than overwritten
 * by an old local snapshot.
 *
 * Usage (run from packages/frontend, where @agentos-sui/sdk and
 * @neondatabase/serverless are both installed):
 *   cd packages/frontend
 *   DATABASE_URL=postgresql://... npx tsx ../../scripts/migrate-to-postgres.ts
 *
 * Prerequisites: run scripts/schema.sql against the target database first.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { config as loadDotenv } from "dotenv";
import { neon } from "@neondatabase/serverless";
import { createPostgresStores } from "@agentos-sui/sdk/node";

const ROOT = join(import.meta.dirname ?? ".", "..");
const REGISTRY_PATH = join(ROOT, ".agentos", "registry.json");

// Load packages/frontend/.env.local (has DATABASE_URL) regardless of which
// directory this script is invoked from.
loadDotenv({ path: join(ROOT, "packages", "frontend", ".env.local") });

interface DelegationRecord {
  childAgent: string;
  childName: string;
  allowedSkills: string[];
  allowedCapabilities: string[];
  spendLimit: string;
  spent: string;
  expiryMs: string;
  revoked: boolean;
  capId?: string;
  createdAt: string;
}

interface RegistryAgentSource {
  suinsName: string;
  runtimeWallet: string;
  network?: "mainnet" | "testnet";
  passportId?: string;
  passportVersion?: string;
  description?: string;
  memoryNamespaces?: string[];
  delegations?: DelegationRecord[];
}

interface RegistryFile {
  version: 1;
  agents: RegistryAgentSource[];
  skills: Array<Record<string, unknown>>;
  workflows?: Array<Record<string, unknown>>;
}

/**
 * `capId` is the durable identity of an on-chain delegation. Legacy/local-only
 * records may not have one, so use their complete immutable source shape as a
 * fallback key. This is deliberately only for migration deduplication; runtime
 * records continue to be managed by RegistryStore.addDelegation().
 */
function delegationKey(delegation: DelegationRecord): string {
  return delegation.capId
    ? `cap:${delegation.capId}`
    : JSON.stringify({
        childAgent: delegation.childAgent,
        childName: delegation.childName,
        allowedSkills: delegation.allowedSkills,
        allowedCapabilities: delegation.allowedCapabilities,
        spendLimit: delegation.spendLimit,
        spent: delegation.spent,
        expiryMs: delegation.expiryMs,
        revoked: delegation.revoked,
        createdAt: delegation.createdAt,
      });
}

async function main() {
  const connectionString =
    process.env.DATABASE_URL?.trim() || process.env.POSTGRES_URL?.trim();
  if (!connectionString) {
    console.error(
      "Set DATABASE_URL (or POSTGRES_URL) to your Neon/Postgres connection string.",
    );
    process.exit(1);
  }

  const raw = readFileSync(REGISTRY_PATH, "utf8");
  const data = JSON.parse(raw) as RegistryFile;

  const sql = neon(connectionString);
  const { registry } = createPostgresStores((text, params) =>
    sql(text, params as unknown[], { fullResults: true }),
  );

  console.log(`Migrating ${data.agents.length} agents...`);
  for (const agent of data.agents) {
    const existing = await registry.findAgentBySuins(agent.suinsName);
    if (!existing) {
      try {
        await registry.registerAgent({
          suinsName: agent.suinsName,
          runtimeWallet: agent.runtimeWallet,
          network: agent.network,
          passportId: agent.passportId,
          passportVersion: agent.passportVersion,
          description: agent.description,
        });
        console.log(`  ✓ ${agent.suinsName}`);
      } catch (e) {
        console.log(
          `  ⏭ ${agent.suinsName} — ${e instanceof Error ? e.message : String(e)}`,
        );
        continue;
      }
    } else {
      console.log(`  ⏭ ${agent.suinsName} — already exists`);
    }

    // registerAgent intentionally has no update/upsert mode (the app uses its
    // duplicate error to protect user-created identities). Import the two
    // append-only ledgers separately so a second migration adds only source
    // records that are not already persisted in Postgres.
    const existingNamespaces = new Set(
      await registry.listMemoryNamespaces(agent.suinsName),
    );
    let importedNamespaces = 0;
    for (const namespace of agent.memoryNamespaces ?? []) {
      if (!existingNamespaces.has(namespace)) {
        await registry.recordMemoryNamespace(agent.suinsName, namespace);
        existingNamespaces.add(namespace);
        importedNamespaces += 1;
      }
    }
    if (importedNamespaces > 0) {
      console.log(`    ↳ ${importedNamespaces} memory namespace(s)`);
    }

    const existingDelegations = await registry.listDelegations(agent.suinsName);
    const existingDelegationKeys = new Set(existingDelegations.map(delegationKey));
    let importedDelegations = 0;
    for (const delegation of agent.delegations ?? []) {
      const key = delegationKey(delegation);
      if (!existingDelegationKeys.has(key)) {
        await registry.addDelegation(agent.suinsName, delegation);
        existingDelegationKeys.add(key);
        importedDelegations += 1;
      }
    }
    if (importedDelegations > 0) {
      console.log(`    ↳ ${importedDelegations} delegation(s)`);
    }
  }

  console.log(`\nMigrating ${data.skills.length} skills...`);
  for (const skill of data.skills) {
    try {
      await registry.publishSkill({
        agentName: skill.agentSlug as string,
        manifest: {
          name: skill.skillId as string,
          version: (skill.version as string).replace(/^v/, ""),
          publisher: skill.mvrPackage as string,
          manifestType: "sui-agent-skill/v1",
          mcp: { compatible: true, tools: [] },
          sui: { movePackage: "0x0", entry: skill.skillId as string, policyRequired: [] },
          dependencies: (skill.dependencies as string[]) ?? [],
        },
        walrusManifestBlob: skill.walrusManifestBlob as string,
        manifestHash: skill.manifestHash as string,
        endEpoch: skill.endEpoch as number | undefined,
        objectId: skill.objectId as string,
        suinsName: skill.suinsName as string | undefined,
        sealPolicyId: skill.sealPolicyId as string | undefined,
        source: skill.source as "custom" | "sui-skills" | "suiperpower" | undefined,
      });
      console.log(`  ✓ ${skill.agentSlug as string}/${skill.skillId as string}`);
    } catch (e) {
      console.log(
        `  ⏭ ${skill.agentSlug as string}/${skill.skillId as string} — ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  const workflows = data.workflows ?? [];
  console.log(`\nMigrating ${workflows.length} workflows...`);
  for (const wf of workflows) {
    try {
      await registry.publishWorkflow({
        agentName: wf.agentSlug as string,
        name: wf.workflowId as string,
        suinsName: wf.suinsName as string,
        version: wf.version as string | undefined,
        walrusManifestBlob: wf.walrusManifestBlob as string | undefined,
        manifestHash: wf.manifestHash as string | undefined,
        endEpoch: wf.endEpoch as number | undefined,
        description: wf.description as string | undefined,
        dependencies: wf.dependencies as string[] | undefined,
        network: wf.network as "mainnet" | "testnet" | undefined,
        status: wf.status as "draft" | "active" | "archived" | undefined,
      });
      console.log(`  ✓ ${wf.slug as string}`);
    } catch (e) {
      console.log(`  ⏭ ${wf.slug as string} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log("\nDone. Verify with the Neon SQL Editor or:");
  console.log('  psql "$DATABASE_URL" -c "SELECT slug, suins_name FROM agents;"');
}

main();
