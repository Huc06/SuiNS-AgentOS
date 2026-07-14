#!/usr/bin/env npx tsx
/**
 * Seed script for testnet demo.
 * When SUI_PRIVATE_KEY is available, mints real AgentPassports on testnet.
 * Otherwise creates local-only registry entries with placeholder IDs.
 *
 * Usage: pnpm seed
 * Env: SUI_PRIVATE_KEY (optional — enables on-chain minting)
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { config } from "dotenv";

// Load .env.local from frontend package for the private key
config({
  path: join(
    import.meta.dirname ?? ".",
    "..",
    "packages",
    "frontend",
    ".env.local",
  ),
});

const ROOT = join(import.meta.dirname ?? ".", "..");
const REGISTRY_PATH = join(ROOT, ".agentos", "registry.json");
const CONFIG_PATH = join(ROOT, ".agentos", "config.json");

interface RegistryAgent {
  slug: string;
  suinsName: string;
  passportId: string;
  runtimeWallet: string;
  network: string;
  passportVersion: string;
  status: string;
  createdAt: string;
  description?: string;
  [key: string]: unknown;
}

interface RegistryFile {
  version: 1;
  agents: RegistryAgent[];
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
  {
    name: "alpha",
    description: "Primary research agent",
    version: "Passport v1.2.4",
  },
  {
    name: "beta-agent",
    description: "Testing & QA agent",
    version: "Passport v0.9.1-beta",
  },
  {
    name: "walrus-bot",
    description: "Storage management agent",
    version: "Passport v2.1.0",
  },
  {
    name: "defi-rebalancer",
    description: "DeFi portfolio rebalancer",
    version: "Passport v1.0.0",
  },
  {
    name: "sui-indexer",
    description: "On-chain data indexer agent",
    version: "Passport v1.0.0",
  },
];

/**
 * Attempt to mint an AgentPassport on-chain using the Sui CLI.
 * Returns the passport object ID on success, null on failure.
 */
function mintOnChain(
  packageId: string,
  suinsName: string,
  runtimeWallet: string,
): { passportId: string; digest: string } | null {
  const privateKey = process.env.SUI_PRIVATE_KEY?.trim();
  if (!privateKey) return null;

  try {
    // Build the PTB command using sui client ptb
    // vector<u8> format for CLI: vector[97u8, 108u8, ...]
    const nameBytes = Array.from(Buffer.from(suinsName))
      .map((b) => `${b}u8`)
      .join(",");
    const cmd = [
      "sui client ptb",
      `--move-call ${packageId}::agent_passport::create "vector[${nameBytes}]" @${runtimeWallet}`,
      "--assign passport",
      `--transfer-objects "[passport]" @${runtimeWallet}`,
      "--gas-budget 50000000",
      "--json",
    ].join(" ");

    const result = execSync(cmd, { encoding: "utf8", timeout: 30000 });
    const parsed = JSON.parse(result);

    const digest = parsed.digest;
    const created = parsed.objectChanges?.find(
      (c: { type: string; objectType?: string; objectId?: string }) =>
        c.type === "created" && c.objectType?.includes("AgentPassport"),
    );

    if (created?.objectId && digest) {
      return { passportId: created.objectId, digest };
    }
  } catch (err) {
    console.warn(
      `   ⚠  On-chain mint failed for ${suinsName}:`,
      (err as Error).message?.slice(0, 80),
    );
  }

  return null;
}

async function main() {
  const appConfig = loadConfig();
  const packageId =
    appConfig.packageId ||
    process.env.NEXT_PUBLIC_AGENTOS_PACKAGE_ID ||
    process.env.AGENTOS_PACKAGE_ID;
  const network = appConfig.network || "testnet";
  const hasPrivateKey = Boolean(process.env.SUI_PRIVATE_KEY?.trim());

  console.log(`\n🌱 Seeding ${DEMO_AGENTS.length} agents on ${network}`);
  console.log(`   Package: ${packageId || "(no packageId)"}`);
  console.log(
    `   On-chain mint: ${hasPrivateKey ? "YES (SUI_PRIVATE_KEY found)" : "NO (local-only)"}\n`,
  );

  const registry = loadRegistry();

  for (const agent of DEMO_AGENTS) {
    const suinsName = `${agent.name}.sui`;
    const existingIdx = registry.agents.findIndex(
      (a) => a.suinsName === suinsName,
    );

    if (existingIdx >= 0) {
      const existing = registry.agents[existingIdx];
      // Skip if already has a real (non-placeholder) passportId
      if (
        existing.passportId &&
        !existing.passportId.includes("000000000000")
      ) {
        console.log(`   ⏭  ${suinsName} — already seeded with real ID`);
        continue;
      }
    }

    // Runtime wallet = the address that will OWN the AgentPassport on-chain.
    // It MUST be the server's signing address (the SUI_PRIVATE_KEY used by the
    // sponsored-execute runtime), otherwise on-chain nodes that take the passport
    // as an owned input (delegate/record_execution) fail Enoki's dry-run with
    // "Transaction was not signed by the correct sender". Set RUNTIME_WALLET_ADDRESS
    // to that address. The ASCII-derived value below is a dev-only placeholder that
    // produces an unspendable owner — do NOT use it for real on-chain runs.
    const runtimeWallet =
      process.env.RUNTIME_WALLET_ADDRESS?.trim() ||
      `0x${Buffer.from(agent.name + "runtimewallet")
        .toString("hex")
        .padEnd(64, "0")
        .slice(0, 64)}`;

    let passportId: string;
    let mintDigest: string | undefined;

    // Try on-chain mint
    if (hasPrivateKey && packageId) {
      const result = mintOnChain(packageId, suinsName, runtimeWallet);
      if (result) {
        passportId = result.passportId;
        mintDigest = result.digest;
        console.log(
          `   ✓  ${suinsName} — minted on-chain: ${passportId.slice(0, 10)}…`,
        );
        console.log(`      tx: ${mintDigest}`);
      } else {
        passportId = `0x${Buffer.from(agent.name + "passport")
          .toString("hex")
          .padEnd(64, "0")
          .slice(0, 64)}`;
        console.log(`   ⚠  ${suinsName} — mint failed, using placeholder ID`);
      }
    } else {
      passportId = `0x${Buffer.from(agent.name + "passport")
        .toString("hex")
        .padEnd(64, "0")
        .slice(0, 64)}`;
      console.log(
        `   ✓  ${suinsName} — registered (local-only, no private key)`,
      );
    }

    const record: RegistryAgent = {
      slug: agent.name,
      suinsName,
      passportId,
      runtimeWallet,
      network,
      passportVersion: agent.version,
      status: "active",
      createdAt: new Date().toISOString(),
      description: agent.description,
    };

    if (existingIdx >= 0) {
      registry.agents[existingIdx] = record;
    } else {
      registry.agents.push(record);
    }
  }

  // ===== Seed Skills =====
  console.log(`\n📦 Seeding skills...`);

  const DEMO_SKILLS = [
    {
      agent: "alpha",
      skillId: "web-search",
      name: "web-search",
      version: "v1.0.0",
    },
    {
      agent: "alpha",
      skillId: "delegate-policy",
      name: "delegate-policy",
      version: "v1.0.0",
    },
    {
      agent: "beta-agent",
      skillId: "sandbox-tool",
      name: "sandbox-tool",
      version: "v0.9.0",
    },
    {
      agent: "walrus-bot",
      skillId: "walrus-read",
      name: "walrus-read",
      version: "v2.0.0",
    },
  ];

  const WALRUS_PUBLISHER = "https://publisher.walrus-testnet.walrus.space";
  const WALRUS_AGGREGATOR = "https://aggregator.walrus-testnet.walrus.space";

  for (const skill of DEMO_SKILLS) {
    const existingSkill = registry.skills.find(
      (s) =>
        (s as { skillId?: string; agentSlug?: string }).skillId ===
          skill.skillId &&
        (s as { agentSlug?: string }).agentSlug === skill.agent,
    );

    // Skip only if already has a real, STILL-REACHABLE blob (not a placeholder
    // and not expired — Walrus testnet blobs die after their epoch lifetime,
    // and the previous "already seeded" check only looked at the blobId's
    // shape, so it kept skipping re-upload for blobs that had already expired).
    if (existingSkill) {
      const blob =
        (existingSkill as { walrusManifestBlob?: string }).walrusManifestBlob ??
        "";
      if (!blob.startsWith("walrus://")) {
        try {
          const statusRes = await fetch(
            `${WALRUS_AGGREGATOR}/v1/blobs/${encodeURIComponent(blob)}`,
            { method: "HEAD" },
          );
          if (statusRes.ok) {
            console.log(
              `   ⏭  ${skill.agent}/${skill.skillId} — already seeded (blob alive)`,
            );
            continue;
          }
          console.log(
            `   ♻  ${skill.agent}/${skill.skillId} — existing blob expired, re-uploading`,
          );
        } catch {
          console.log(
            `   ♻  ${skill.agent}/${skill.skillId} — could not verify existing blob, re-uploading`,
          );
        }
      }
    }

    // Build a real manifest
    const manifest = {
      name: skill.skillId,
      version: skill.version.replace("v", ""),
      publisher: `@${skill.agent}`,
      manifestType: "sui-agent-skill/v1",
      mcp: {
        compatible: true,
        tools: [{ name: skill.skillId, description: `${skill.name} skill` }],
      },
      sui: {
        movePackage: packageId || "0x0",
        entry: "main::execute",
        policyRequired: [],
      },
      dependencies: [],
    };

    const manifestBytes = Buffer.from(JSON.stringify(manifest, null, 2));
    const { createHash } = await import("node:crypto");
    const manifestHash = `0x${createHash("sha256").update(manifestBytes).digest("hex")}`;

    // Upload manifest to Walrus
    let blobId = `walrus://blob/${skill.skillId}-${skill.version}`;
    let endEpoch: number | undefined;
    try {
      const uploadRes = await fetch(`${WALRUS_PUBLISHER}/v1/blobs?epochs=53`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: manifestBytes,
      });
      if (uploadRes.ok) {
        const uploadData = (await uploadRes.json()) as {
          newlyCreated?: {
            blobObject?: { blobId?: string; storage?: { endEpoch?: number } };
          };
          alreadyCertified?: { blobId?: string; endEpoch?: number };
        };
        blobId =
          uploadData.newlyCreated?.blobObject?.blobId ??
          uploadData.alreadyCertified?.blobId ??
          blobId;
        endEpoch =
          uploadData.newlyCreated?.blobObject?.storage?.endEpoch ??
          uploadData.alreadyCertified?.endEpoch;
        console.log(
          `   ✓  ${skill.agent}/${skill.skillId} — uploaded to Walrus: ${blobId.slice(0, 16)}… (endEpoch=${endEpoch ?? "?"})`,
        );
      } else {
        console.log(
          `   ⚠  ${skill.agent}/${skill.skillId} — Walrus upload failed (${uploadRes.status}), using placeholder`,
        );
      }
    } catch (err) {
      console.log(
        `   ⚠  ${skill.agent}/${skill.skillId} — Walrus unreachable, using placeholder`,
      );
    }

    // Mint SkillDescriptor on-chain
    let objectId = `0x${createHash("sha256")
      .update(skill.agent + skill.skillId)
      .digest("hex")
      .slice(0, 64)}`;
    if (hasPrivateKey && packageId) {
      try {
        const skillIdBytes = Array.from(Buffer.from(skill.skillId))
          .map((b) => `${b}u8`)
          .join(",");
        const blobBytes = Array.from(Buffer.from(blobId))
          .map((b) => `${b}u8`)
          .join(",");
        const hashBytes = Array.from(Buffer.from(manifestHash))
          .map((b) => `${b}u8`)
          .join(",");
        const mvrBytes = Array.from(
          Buffer.from(`@${skill.agent}/${skill.skillId}`),
        )
          .map((b) => `${b}u8`)
          .join(",");
        const versionBytes = Array.from(Buffer.from(skill.version))
          .map((b) => `${b}u8`)
          .join(",");
        const subnameBytes = Array.from(
          Buffer.from(`${skill.skillId}.${skill.agent}.sui`),
        )
          .map((b) => `${b}u8`)
          .join(",");

        const cmd = [
          "sui client ptb",
          `--move-call ${packageId}::skill_descriptor::create "vector[${skillIdBytes}]" "vector[${blobBytes}]" "vector[${hashBytes}]" "vector[${mvrBytes}]" "vector[${versionBytes}]" "vector[${subnameBytes}]" "vector[]"`,
          "--assign descriptor",
          `--transfer-objects "[descriptor]" @${registry.agents.find((a) => a.slug === skill.agent)?.runtimeWallet || "0x0"}`,
          "--gas-budget 50000000",
          "--json",
        ].join(" ");

        const result = execSync(cmd, { encoding: "utf8", timeout: 30000 });
        const parsed = JSON.parse(result);
        const created = parsed.objectChanges?.find(
          (c: { type: string; objectType?: string; objectId?: string }) =>
            c.type === "created" && c.objectType?.includes("SkillDescriptor"),
        );
        if (created?.objectId) {
          objectId = created.objectId;
          console.log(
            `   ✓  ${skill.agent}/${skill.skillId} — on-chain: ${objectId.slice(0, 10)}…`,
          );
        }
      } catch (err) {
        console.warn(
          `   ⚠  ${skill.agent}/${skill.skillId} — on-chain mint failed, using hash ID`,
        );
      }
    }

    // Update registry
    const skillRecord = {
      agentSlug: skill.agent,
      skillId: skill.skillId,
      name: skill.name,
      mvrPackage: `@${skill.agent}/${skill.skillId}`,
      version: skill.version,
      walrusManifestBlob: blobId,
      manifestHash,
      ...(endEpoch !== undefined ? { endEpoch } : {}),
      objectId,
      network,
      status: "active",
      resolutions: "0",
      lastUpdated: new Date().toISOString(),
      icon: "token",
      source: "custom",
      suinsName: `${skill.skillId}.${skill.agent}.sui`,
    };

    const existIdx = registry.skills.findIndex(
      (s) =>
        (s as { skillId?: string; agentSlug?: string }).skillId ===
          skill.skillId &&
        (s as { agentSlug?: string }).agentSlug === skill.agent,
    );
    if (existIdx >= 0) {
      registry.skills[existIdx] = skillRecord;
    } else {
      registry.skills.push(skillRecord);
    }
  }

  // Save and copy to frontend seed
  saveRegistry(registry);
  const frontendSeed = join(ROOT, "packages", "frontend", "registry.seed.json");
  writeFileSync(frontendSeed, JSON.stringify(registry, null, 2) + "\n", "utf8");

  console.log(`\n✅ Registry saved: ${REGISTRY_PATH}`);
  console.log(`✅ Frontend seed: ${frontendSeed}`);
  console.log(
    `📋 Total: ${registry.agents.length} agents, ${registry.skills.length} skills`,
  );

  if (packageId) {
    console.log(
      `\n🔗 Suiscan: https://suiscan.xyz/testnet/object/${packageId}`,
    );
  }
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
