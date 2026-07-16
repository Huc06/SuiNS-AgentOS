#!/usr/bin/env npx tsx
/**
 * One-time migration: copy the existing `.agentos/registry.json` into a
 * Postgres database (Neon / Vercel Postgres), for switching a deployment from
 * STORAGE_BACKEND=file (or memory) to STORAGE_BACKEND=postgres.
 *
 * Re-runs are safe: registerAgent/publishSkill/publishWorkflow all upsert.
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

interface RegistryFile {
  version: 1;
  agents: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
  workflows?: Array<Record<string, unknown>>;
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
    try {
      await registry.registerAgent({
        suinsName: agent.suinsName as string,
        runtimeWallet: agent.runtimeWallet as string,
        network: agent.network as "mainnet" | "testnet" | undefined,
        passportId: agent.passportId as string | undefined,
        passportVersion: agent.passportVersion as string | undefined,
        description: agent.description as string | undefined,
      });
      console.log(`  ✓ ${agent.suinsName as string}`);
    } catch (e) {
      console.log(
        `  ⏭ ${agent.suinsName as string} — ${e instanceof Error ? e.message : String(e)} (likely already exists)`,
      );
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
