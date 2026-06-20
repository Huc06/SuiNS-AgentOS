#!/usr/bin/env node
/**
 * Seed the local AgentOS registry with multiple agents whose skills are imported
 * from the official Mysten Labs Agent Skills catalog (github.com/MystenLabs/skills).
 *
 * Each SKILL.md is run through the SAME import pipeline the CLI/dashboard use
 * (`convertToAgentOSManifest`) and registered with `source: "sui-skills"`. These
 * are *knowledge* skills (no Move `entry`), so they import as non-executable,
 * MCP-tool-definition skills — discoverable & hash-verified, but not on-chain PTBs.
 *
 * No gas, local-registry only, fully reversible:  --reset  re-seeds cleanly.
 *
 * Usage:
 *   node scripts/seed-mysten-skills.mjs            # clone + seed
 *   node scripts/seed-mysten-skills.mjs --src DIR  # use an existing checkout
 *   node scripts/seed-mysten-skills.mjs --reset    # remove our agents first, then seed
 */
import { execSync } from "node:child_process";
import { mkdtempSync, existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");

// Import the built SDK node entry directly (root doesn't symlink @agentos/sdk).
const sdkNode = pathToFileURL(join(repoRoot, "packages/sdk/dist/node.js")).href;
const { LocalRegistry, convertToAgentOSManifest } = await import(sdkNode);

const REPO = "https://github.com/MystenLabs/skills.git";

// --- The multi-agent layout: 4 agents, each owning a themed cluster of skills. ---
const AGENTS = [
  {
    suins: "sui-move-expert.sui",
    passportVersion: "Passport v1.0.0",
    description: "Move language & contract-authoring specialist (Mysten skills).",
    skills: [
      "sui-move",
      "modern-move-syntax",
      "naming-conventions",
      "composable-move-functions",
      "move-unit-testing",
      "object-model",
    ],
  },
  {
    suins: "sui-toolsmith.sui",
    passportVersion: "Passport v1.0.0",
    description: "Sui CLI, build, publish & client tooling agent (Mysten skills).",
    skills: [
      "sui-install",
      "sui-cli",
      "sui-client",
      "sui-build-test",
      "sui-publish",
      "sui-move-project",
      "sui-overview",
    ],
  },
  {
    suins: "sui-appsmith.sui",
    passportVersion: "Passport v1.0.0",
    description: "dApp frontend, SDKs, PTBs & data-access agent (Mysten skills).",
    skills: [
      "frontend-apps",
      "sui-sdks",
      "ptbs",
      "accessing-data",
      "generate-sui-agent-config",
    ],
  },
  {
    suins: "walrus-keeper.sui",
    passportVersion: "Passport v1.0.0",
    description: "Walrus Sites & decentralized-storage agent (Mysten skills).",
    skills: ["walrus-sites"],
  },
];

// --- CLI args ---
const args = process.argv.slice(2);
const reset = args.includes("--reset");
const srcIdx = args.indexOf("--src");
let srcDir = srcIdx >= 0 ? args[srcIdx + 1] : null;

// --- Resolve the skills checkout (clone if needed) ---
if (!srcDir) {
  srcDir = mkdtempSync(join(tmpdir(), "mysten-skills-"));
  process.stdout.write(`Cloning ${REPO} → ${srcDir}\n`);
  execSync(`git clone --depth 1 ${REPO} ${JSON.stringify(srcDir)}`, {
    stdio: ["ignore", "ignore", "inherit"],
  });
}
if (!existsSync(srcDir)) {
  throw new Error(`skills source dir not found: ${srcDir}`);
}

/**
 * Minimal frontmatter reader that, unlike the SDK's parser, also flattens YAML
 * folded scalars (`description: >`) — which is how every Mysten SKILL.md is written.
 */
function readSkillMeta(skillDir) {
  const file = join(srcDir, skillDir, "SKILL.md");
  if (!existsSync(file)) return null;
  const text = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") return null;
  const end = lines.indexOf("---", 1);
  if (end < 0) return null;
  const fm = lines.slice(1, end);

  const out = {};
  for (let i = 0; i < fm.length; i++) {
    const m = /^([A-Za-z0-9_-]+)\s*:\s*(.*)$/.exec(fm[i]);
    if (!m || /^\s/.test(fm[i])) continue;
    const key = m[1];
    let val = m[2].trim();
    if (val === ">" || val === "|" || val === ">-" || val === "|-" || val === "") {
      // Folded/literal block scalar: collect following indented lines.
      const buf = [];
      let j = i + 1;
      for (; j < fm.length; j++) {
        if (fm[j].trim() === "") { buf.push(""); continue; }
        if (/^\s/.test(fm[j])) buf.push(fm[j].trim());
        else break;
      }
      val = buf.join(" ").replace(/\s+/g, " ").trim();
      i = j - 1;
    } else {
      val = val.replace(/^["']|["']$/g, "");
    }
    out[key] = val;
  }
  return out.name && out.description ? out : null;
}

// --- Seed ---
const registry = new LocalRegistry(join(repoRoot, ".agentos/registry.json"));

let agentCount = 0;
let skillCount = 0;
const skipped = [];

for (const agent of AGENTS) {
  // Idempotency: with --reset (or always, since re-running is cheap) drop+re-add.
  const existing = registry.resolveAgent(agent.suins);
  if (existing) {
    if (reset || existing.agent.suinsName === agent.suins) {
      registry.removeAgent(agent.suins);
    }
  }

  registry.registerAgent({
    suinsName: agent.suins,
    runtimeWallet: "0x0",
    network: "testnet",
    passportVersion: agent.passportVersion,
    description: agent.description,
  });
  agentCount++;

  const slug = agent.suins.replace(/\.sui$/, "");
  for (const skill of agent.skills) {
    const meta = readSkillMeta(skill);
    if (!meta) { skipped.push(skill); continue; }

    // First sentence of the description keeps catalog cards readable.
    const shortDesc = meta.description.split(/(?<=\.)\s/)[0].slice(0, 240);

    const manifest = convertToAgentOSManifest(
      { name: meta.name, description: shortDesc, instructions: "" },
      { publisher: slug }, // no movePackage → instruction-only (non-executable) skill
    );

    registry.publishSkill({
      agentName: agent.suins,
      manifest,
      network: "testnet",
      source: "sui-skills",
    });
    skillCount++;
  }
  process.stdout.write(`  ✓ ${agent.suins} — ${agent.skills.length} skills\n`);
}

process.stdout.write(
  `\nSeeded ${agentCount} agents / ${skillCount} skills from Mysten Labs (source: sui-skills).\n`,
);
if (skipped.length) {
  process.stdout.write(`Skipped (no SKILL.md / missing fields): ${skipped.join(", ")}\n`);
}
process.stdout.write(`Registry: ${join(repoRoot, ".agentos/registry.json")}\n`);
