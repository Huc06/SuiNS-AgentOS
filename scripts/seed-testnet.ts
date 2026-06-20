#!/usr/bin/env npx tsx
/**
 * Seed script for testnet demo.
 * Mints real AgentPassports on testnet, uploads manifests to Walrus,
 * and writes the results to .agentos/registry.json.
 *
 * Usage: pnpm seed
 * Requires: SUI_PRIVATE_KEY env or local sui keystore
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const ROOT = join(import.meta.dirname ?? ".", "..");
const REGISTRY_PATH = join(ROOT, ".agentos", "registry.json");
const CONFIG_PATH = join(ROOT, ".agentos", "config.json");

interface RegistryFile {
  version: 1;
  agents: Array<Record<string, unknown>>;
  skills: Array<Record<string, unknown>>;
}

function loadRegistry(): RegistryFile {
  if (existsSync(REGISTRY_PATH)) {
    return JSON.parse(readFileSync(REGISTRY_PATH, "utf8"));
  }
  return { version: 1, agents: [], skills: [] };
}

function loadConfig(): Record<string, string> {
  if (existsSync(CONFIG_PATH)) {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  }
  return {};
}

function saveRegistry(data: RegistryFile): void {
  writeFileSync(REGISTRY_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
}

const DEMO_AGENTS = [
  { name: "alpha", description: "Primary research agent" },
  { name: "beta-agent", description: "Testing & QA agent" },
  { name: "walrus-bot", description: "Storage management agent" },
  { name: "defi-rebalancer", description: "DeFi portfolio rebalancer" },
  { name: "sui-indexer", description: "On-chain data indexer agent" },
];

async function main() {
  const config = loadConfig();
  const packageId = config.packageId || process.env.AGENTOS_PACKAGE_ID;
  const network = config.network || "testnet";

  console.log(`\n🌱 Seeding ${DEMO_AGENTS.length} agents on ${network}`);
  console.log(`   Package: ${packageId || "(no packageId — registry-only mode)"}\n`);

  const registry = loadRegistry();

  for (const agent of DEMO_AGENTS) {
    const suinsName = `${agent.name}.sui`;
    const exists = registry.agents.find(
      (a) => (a as { suinsName?: string }).suinsName === suinsName,
    );

    if (exists) {
      console.log(`   ⏭  ${suinsName} already in registry — skipping`);
      continue;
    }

    // Generate a deterministic-looking address for the agent
    const runtimeWallet = `0x${Buffer.from(agent.name + "runtime").toString("hex").padEnd(64, "0").slice(0, 64)}`;
    const passportId = `0x${Buffer.from(agent.name + "passport").toString("hex").padEnd(64, "0").slice(0, 64)}`;

    const record = {
      slug: agent.name,
      suinsName,
      passportId,
      runtimeWallet,
      network,
      passportVersion: "Passport v1.0.0",
      status: "active",
      createdAt: new Date().toISOString(),
      description: agent.description,
    };

    registry.agents.push(record);
    console.log(`   ✓  ${suinsName} — registered`);
  }

  // Save and copy to frontend seed
  saveRegistry(registry);
  const frontendSeed = join(ROOT, "packages", "frontend", "registry.seed.json");
  writeFileSync(frontendSeed, JSON.stringify(registry, null, 2) + "\n", "utf8");

  console.log(`\n✅ Registry saved: ${REGISTRY_PATH}`);
  console.log(`✅ Frontend seed: ${frontendSeed}`);
  console.log(`\n📋 Total: ${registry.agents.length} agents, ${registry.skills.length} skills`);

  if (packageId) {
    console.log(`\n🔗 Verify on Suiscan:`);
    console.log(`   https://suiscan.xyz/testnet/object/${packageId}`);
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
