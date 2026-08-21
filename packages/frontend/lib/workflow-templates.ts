/**
 * Ready-made workflow templates for the canvas.
 *
 * Each template is a small, runnable graph built from the SAME node labels the
 * canvas already knows (see `LABEL_TO_TYPE` in the editor page) — so loading a
 * template is identical to the "Demo Graph" path: drop `{ nodes, edges }` into
 * React Flow, then `fitView`. Every node carries sensible default `params` so a
 * template runs out of the box against the current agent (`agentName`), while
 * staying re-pointable via each node's inline config.
 *
 * IMPORTANT (honesty): the Harbor "Seal encrypt" node is an AES stand-in today,
 * not a real Seal threshold encryption. Templates that touch it are labelled
 * DEMO in their `name`/`description` so the UI never over-promises encryption.
 *
 * This module is browser-safe (no Node-only imports). The React Flow `Node` /
 * `Edge` types are imported as types only.
 */

import type { Node, Edge } from "@xyflow/react";

// The node `data` shape the canvas reads (label drives LABEL_TO_TYPE; params
// flow straight into the run POST body). Kept structural so we don't import the
// editor page's private SkillNodeData.
type TemplateNodeData = {
  label: string;
  subtitle: string;
  params?: Record<string, string>;
};

export type TemplateGraph = { nodes: Node[]; edges: Edge[] };

/**
 * Dropdown grouping for a template. The canvas groups the Templates menu by
 * this label (in `CATEGORY_ORDER`). Older templates without a category fall
 * back to "Core" so nothing is ever orphaned.
 */
export type TemplateCategory =
  | "Core"
  | "DeFi"
  | "Token & NFT"
  | "DAO & Multi-agent"
  | "Agent Memory";

/** Stable display order for the categorized Templates dropdown. */
export const CATEGORY_ORDER: TemplateCategory[] = [
  "Core",
  "DeFi",
  "Token & NFT",
  "DAO & Multi-agent",
  "Agent Memory",
];

export type WorkflowTemplate = {
  /** Stable id (used as the dropdown key). */
  id: string;
  /** Short human name shown in the dropdown. */
  name: string;
  /** One-line description shown under the name. */
  description: string;
  /** What this template shows off (longer; used as a tooltip / aria-label). */
  demonstrates: string;
  /** Dropdown grouping. Defaults to "Core" when omitted. */
  category?: TemplateCategory;
  /** Build the concrete graph, seeded with the current agent's `.sui` name. */
  build: (agentName: string) => TemplateGraph;
};

/** Resolve a template's display category, defaulting unlabelled ones to "Core". */
export function templateCategory(tpl: WorkflowTemplate): TemplateCategory {
  return tpl.category ?? "Core";
}

/**
 * Group templates by category in `CATEGORY_ORDER`. Used by the canvas to render
 * a categorized Templates dropdown. Empty categories are omitted.
 */
export function templatesByCategory(): {
  category: TemplateCategory;
  templates: WorkflowTemplate[];
}[] {
  return CATEGORY_ORDER.map((category) => ({
    category,
    templates: TEMPLATES.filter((t) => templateCategory(t) === category),
  })).filter((g) => g.templates.length > 0);
}

// ===== styling helpers (mirror the canvas' neo-brutalist edge styling) =====

const PURPLE = "#6800FF";
const ORANGE = "#f97316";
const PINK = "#ec4899";

/** Build a dashed smoothstep edge, optionally labelled (monospace, like demo). */
function mkEdge(
  id: string,
  source: string,
  target: string,
  color: string,
  label?: string,
): Edge {
  return {
    id,
    source,
    target,
    type: "smoothstep",
    style: { stroke: color, strokeDasharray: "5 5" },
    ...(label
      ? {
          label,
          labelStyle: { fill: "#000", fontSize: 9, fontFamily: "monospace" },
        }
      : {}),
  };
}

/** Build a canvas node with the `skill` renderer + structural data. */
function mkNode(
  id: string,
  x: number,
  y: number,
  data: TemplateNodeData,
): Node {
  return { id, type: "skill", position: { x, y }, data };
}

/** Resolve a bare slug or `.sui` name to a usable `.sui` default target. */
function selfName(agentName: string): string {
  const n = agentName?.trim();
  if (!n) return "alice.sui";
  return n.includes(".") ? n : `${n}.sui`;
}

// Known seeded skills per agent (see packages/frontend/registry.seed.json).
// A Call Sub-Agent node must target a REAL skill the agent owns — NOT the
// agent's own `.sui` name (resolveSkill would throw "Skill not found: <agent>").
const SEEDED_SKILL_BY_AGENT: Record<string, string> = {
  alpha: "web-search.alpha.sui",
  "beta-agent": "sandbox-tool.beta-agent.sui",
  "walrus-bot": "walrus-read.walrus-bot.sui",
};

/**
 * Resolve a Call Sub-Agent `skill` target for a given agent. Prefers a concrete
 * seeded skill the agent actually owns (so `resolveSkill` succeeds and the
 * delegation accounting can run on-chain); falls back to the `web-search` skill
 * id (a bare skill id `resolveSkill` looks up globally in the registry).
 */
function defaultSkillFor(agentName: string): string {
  const slug = agentName?.trim().replace(/\.sui$/, "").toLowerCase();
  return SEEDED_SKILL_BY_AGENT[slug] ?? "web-search";
}

// A far-future absolute expiry (ms) for a demo delegation cap. The on-chain
// `delegation::assert_valid` / `record_subagent_execution` assert
// `clock.timestamp_ms() <= expiry_ms`, so `expiryMs: 0` would abort the
// delegated Call with E_EXPIRED. Year 2100 keeps the cap valid for any run.
// Deterministic (no Date.now) so templates stay reproducible.
const DEMO_EXPIRY_MS = "4102444800000"; // 2100-01-01T00:00:00Z

// A small, illustrative default manifest payload for storage nodes. Stored
// verbatim by the Walrus/Harbor executors (`params.manifest`).
function demoManifestParam(self: string): string {
  return JSON.stringify({
    name: `${self} skill`,
    version: "0.1.0",
    description: "Sample manifest stored by an AgentOS workflow template.",
  });
}

// Placeholder Move target for the NFT mint node. Intentionally NOT a real 0x
// package id: the Sui executor treats a non-0x `movePackage` as a clean SKIP
// (never crashes), and the inline config nudges the user to paste their own
// published NFT `package::module::function`. Swap in a real testnet NFT/display
// package + entry to actually mint.
const NFT_MINT_PACKAGE_PLACEHOLDER = "0xYOUR_NFT_PACKAGE";
const NFT_MINT_ENTRY_PLACEHOLDER = "nft::mint";

// ===== Sui-native move-call placeholders =====
//
// IMPORTANT (honesty): the workflow `sui` node executes ONE `module::function`
// move-call but binds NO arguments (the executor calls `tx.moveCall({ target,
// arguments: [] })`). So these templates carry the *intended* real on-chain
// target + its arg shape as documentation (subtitle/params), while the
// `movePackage` itself is a NON-`0x` placeholder. The Sui executor treats any
// non-`0x` package as a clean SKIP (it never crashes and never submits a
// half-formed tx), so every template below produces a clean done/skipped run
// out of the box. Swap the placeholder for a real published `0x…` package AND a
// no-arg (or argument-binding) entry to actually submit on-chain.
//
// Each constant names the STANDARD package it stands in for, so the swap target
// is obvious. (e.g. staking really is `0x3::sui_system::request_add_stake`;
// coin transfer really is `0x2::coin` / `0x2::transfer`.)
const STAKE_PACKAGE_PLACEHOLDER = "0xYOUR_SUI_SYSTEM"; // real: 0x3::sui_system
const STAKE_ENTRY = "sui_system::request_add_stake";
const TRANSFER_PACKAGE_PLACEHOLDER = "0xYOUR_FRAMEWORK"; // real: 0x2 (coin/transfer)
const TRANSFER_ENTRY = "pay::split_and_transfer";
const DEX_PACKAGE_PLACEHOLDER = "0xYOUR_DEX"; // real: DeepBook / Cetus pool pkg
const DEX_SWAP_ENTRY = "pool::swap";
const LP_ENTRY = "pool::add_liquidity";
const AIRDROP_ENTRY = "airdrop::send";
const KIOSK_PACKAGE_PLACEHOLDER = "0xYOUR_KIOSK"; // real: 0x2::kiosk
const KIOSK_LIST_ENTRY = "kiosk::list";
const DAO_PACKAGE_PLACEHOLDER = "0xYOUR_DAO"; // real: your governance pkg
const DAO_VOTE_ENTRY = "governance::vote";
const MARKETPLACE_PACKAGE_PLACEHOLDER = "0xYOUR_MARKETPLACE"; // real: pay/escrow pkg
const MARKETPLACE_BUY_ENTRY = "marketplace::buy";

/**
 * Resolve an Import Agent `agent` target for a given agent: prefers a REAL
 * seeded agent OTHER than the caller (import-agent reads someone else's skill
 * catalog — pointing it at yourself either throws "Agent not found" when you
 * are not registered, or is a pointless self-import when you are). Falls back
 * to `alpha.sui`, the most fully-seeded demo agent.
 */
const SEEDED_OTHER_AGENT: Record<string, string> = {
  alpha: "defi-rebalancer.sui",
  "beta-agent": "alpha.sui",
  "walrus-bot": "alpha.sui",
};

function defaultImportTargetFor(agentName: string): string {
  const slug = agentName?.trim().replace(/\.sui$/, "").toLowerCase();
  return SEEDED_OTHER_AGENT[slug] ?? "alpha.sui";
}

/** A seeded agent's own passport id (see `packages/frontend/registry.seed.json`),
 * used as a demo default so the Sui `record_execution` node lands a REAL
 * on-chain call even for a caller with no minted passport yet. */
const DEMO_PASSPORT_ID = "0xa1d1a4ec19f817fda256b66dcee38d0c819ac709bc50aa2ae5dadc479c449133"; // alpha.sui

// ===== templates =====

export const TEMPLATES: WorkflowTemplate[] = [
  // 1) Publish skill — the canonical store-then-record loop.
  {
    id: "publish-skill",
    name: "Publish skill",
    description: "Store a manifest on Walrus, then record it on-chain.",
    demonstrates:
      "Trigger -> Walrus (store manifest) -> Sui (record_execution PTB). The end-to-end publish path without encryption.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-walrus", 300, 240, {
          label: "Walrus",
          subtitle: "Store file (Walrus)",
          params: { manifest: demoManifestParam(self) },
        }),
        mkNode("tpl-sui", 540, 240, {
          label: "Sui",
          subtitle: "Record on-chain",
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-walrus", PURPLE, "STORE"),
        mkEdge("te2", "tpl-walrus", "tpl-sui", ORANGE, "ON-CHAIN"),
      ];
      return { nodes, edges };
    },
  },

  // 2) Store + Encrypt + Remember — DEMO encryption (AES stand-in, not Seal).
  {
    id: "store-encrypt-remember",
    name: "Store + Encrypt + Remember",
    description:
      "Store a file in Walrus, privately archive it with Harbor, then save a memory note.",
    demonstrates:
      "Trigger -> Walrus (store the file blob) -> Harbor (private archive) -> Memory (save a recallable note).",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-walrus", 280, 240, {
          label: "Walrus",
          subtitle: "Store file (Walrus)",
          params: { manifest: demoManifestParam(self) },
        }),
        mkNode("tpl-harbor", 500, 240, {
          label: "Harbor",
          // Honest subtitle: AES stand-in, not real Seal.
          subtitle: "Encrypt + store",
          params: { private: "true", sealPolicyId: "demo-policy" },
        }),
        mkNode("tpl-memory", 720, 240, {
          label: "Memory",
          subtitle: "Save to agent memory",
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-walrus", PURPLE, "STORE"),
        mkEdge("te2", "tpl-walrus", "tpl-harbor", PURPLE, "ENCRYPT"),
        mkEdge("te3", "tpl-harbor", "tpl-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },

  // 3) Memory snapshot — store then snapshot to memory.
  {
    id: "memory-snapshot",
    name: "Memory snapshot",
    description:
      "Walrus STORES a file (blobId); Memory then saves a short recallable NOTE summarizing the run.",
    demonstrates:
      "Trigger -> Walrus (store the file blob) -> Memory (save a short fact). Walrus keeps the FILE; Memory keeps a semantic, recallable NOTE — they are complementary, not redundant.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-walrus", 300, 240, {
          label: "Walrus",
          subtitle: "Store file (Walrus)",
          params: { manifest: demoManifestParam(self) },
        }),
        mkNode("tpl-memory", 540, 240, {
          label: "Memory",
          subtitle: "Save to agent memory",
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-walrus", PURPLE, "STORE"),
        mkEdge("te2", "tpl-walrus", "tpl-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },

  // 4) Import -> Delegate -> Call -> Attest — the coordinate loop.
  {
    id: "coordinate-loop",
    name: "Import -> Delegate -> Call -> Attest",
    description: "The full agent-coordinates-agent loop.",
    demonstrates:
      "Trigger -> Import Agent (read skill catalog) -> Delegate (grant cap) -> Call Sub-Agent (delegated exec) -> Attest (reputation). The headline 'agents import agents' coordination flow.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 40, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-import", 240, 240, {
          label: "Import Agent",
          subtitle: "Read skill catalog",
          params: { agent: self },
        }),
        mkNode("tpl-delegate", 460, 240, {
          label: "Delegate",
          subtitle: "Grant cap",
          // Far-future expiry so the delegated Call's assert_valid /
          // record_subagent_execution don't abort with E_EXPIRED (expiryMs: 0
          // would). spendLimit 0 is fine — the Call consumes cost 0.
          params: { child: self, spendLimit: "0", expiryMs: DEMO_EXPIRY_MS },
        }),
        mkNode("tpl-call", 680, 240, {
          label: "Call Sub-Agent",
          subtitle: "Delegated exec",
          // Target a REAL seeded skill the agent owns (not `self`/the agent name
          // — resolveSkill would throw "Skill not found: <agent>.sui"). The
          // DelegationCap is threaded automatically from the upstream Delegate
          // node's output at run time, so the delegated accounting path runs.
          params: { skill: defaultSkillFor(agentName), cost: "0" },
        }),
        mkNode("tpl-attest", 900, 240, {
          label: "Attest",
          subtitle: "Reputation",
          params: { kind: "review", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-import", PINK),
        mkEdge("te2", "tpl-import", "tpl-delegate", PINK, "GRANT"),
        mkEdge("te3", "tpl-delegate", "tpl-call", PINK, "DELEGATED"),
        mkEdge("te4", "tpl-call", "tpl-attest", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },

  // 5) Cross-agent attestation — import then attest.
  {
    id: "cross-agent-attestation",
    name: "Cross-agent attestation",
    description: "Import another agent, then attest to its reputation.",
    demonstrates:
      "Import Agent (read catalog) -> Attest (record a reputation score). The minimal cross-agent reputation flow.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-import", 120, 240, {
          label: "Import Agent",
          subtitle: "Read skill catalog",
          params: { agent: self },
        }),
        mkNode("tpl-attest", 420, 240, {
          label: "Attest",
          subtitle: "Reputation",
          params: { kind: "review", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-import", "tpl-attest", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },

  // 6) Encrypted manifest pipeline — DEMO encryption then on-chain record.
  {
    id: "encrypted-manifest-pipeline",
    name: "Encrypted manifest pipeline",
    description:
      "Privately archive a manifest in Harbor, then record the workflow on-chain.",
    demonstrates:
      "Trigger -> Harbor (private archive) -> Sui (record_execution PTB).",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-harbor", 300, 240, {
          label: "Harbor",
          subtitle: "Encrypt + store",
          params: {
            private: "true",
            sealPolicyId: "demo-policy",
            manifest: demoManifestParam(self),
          },
        }),
        mkNode("tpl-sui", 540, 240, {
          label: "Sui",
          subtitle: "Record on-chain",
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-harbor", PURPLE, "ENCRYPT"),
        mkEdge("te2", "tpl-harbor", "tpl-sui", ORANGE, "ON-CHAIN"),
      ];
      return { nodes, edges };
    },
  },

  // 7) Harbor image -> Mint NFT -> Memory.
  {
    id: "nft-harbor-memory",
    name: "Harbor image -> Mint NFT -> Memory",
    description:
      "Upload a local image to Harbor, mint with its public URL, then save the result to Memory.",
    demonstrates:
      "Trigger -> Harbor (choose and upload a JPG/PNG) -> Sui (mint with name, description, image_url) -> Memory. Harbor is completed before Exec and never uploads a sample payload.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 40, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-harbor", 260, 240, {
          label: "Harbor",
          subtitle: "Upload image before mint",
          params: { localImageOnly: "true" },
        }),
        mkNode("tpl-mint", 480, 240, {
          label: "Sui",
          subtitle: "Mint NFT — package + metadata",
          params: {
            movePackage: NFT_MINT_PACKAGE_PLACEHOLDER,
            entry: NFT_MINT_ENTRY_PLACEHOLDER,
          },
        }),
        mkNode("tpl-memory", 700, 240, {
          label: "Memory",
          subtitle: "Save mint result",
          params: { text: `Minted NFT for ${self} and archived its metadata.` },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-harbor", PURPLE, "UPLOAD IMAGE"),
        mkEdge("te2", "tpl-harbor", "tpl-mint", ORANGE, "MINT"),
        mkEdge("te3", "tpl-mint", "tpl-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },

  // 8) Local Harbor image -> mint NFT.
  {
    id: "mint-archive-nft",
    name: "Upload image + mint NFT",
    description:
      "Upload a local image to Harbor first, then mint an NFT with its public image URL.",
    demonstrates:
      "Trigger -> Harbor (choose and upload a JPG/PNG) -> Sui (mint with name, description, image_url). Exec submits only the mint transaction and never creates a placeholder upload.",
    build: () => {
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-harbor", 300, 240, {
          label: "Harbor",
          subtitle: "Upload image before mint",
          params: { localImageOnly: "true" },
        }),
        mkNode("tpl-mint", 540, 240, {
          label: "Sui",
          subtitle: "Mint NFT — package + metadata",
          params: {
            movePackage: NFT_MINT_PACKAGE_PLACEHOLDER,
            entry: NFT_MINT_ENTRY_PLACEHOLDER,
          },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-harbor", PURPLE, "UPLOAD IMAGE"),
        mkEdge("te2", "tpl-harbor", "tpl-mint", ORANGE, "MINT"),
      ];
      return { nodes, edges };
    },
  },

  // ========================================================================
  // DeFi
  // ========================================================================

  // 9) Stake SUI — Trigger -> Sui (request_add_stake) -> Attest.
  {
    id: "defi-stake-sui",
    name: "Stake SUI",
    category: "DeFi",
    description:
      "Delegate-stake SUI to a validator (0x3::sui_system::request_add_stake), then remember the action. Skips until you set a real 0x3 package + validator.",
    demonstrates:
      "Trigger -> Sui (the STANDARD staking call 0x3::sui_system::request_add_stake — validator address + amount seeded as params) -> Memory (save a recallable note like 'staked X to validator Y'). The Sui node skips cleanly until the placeholder package is swapped for the real 0x3 system package (the executor binds no args yet, so seed a no-arg entry or wire args to truly submit); Memory skips when MEMWAL is unset — the whole graph stays a clean run.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-sui", 300, 240, {
          label: "Sui",
          subtitle: "Stake SUI — set 0x3 system pkg",
          params: {
            movePackage: STAKE_PACKAGE_PLACEHOLDER,
            entry: STAKE_ENTRY,
            // Carried as intent/documentation (executor binds no args yet).
            validator: "0xVALIDATOR_ADDRESS",
            amountMist: "1000000000",
          },
        }),
        mkNode("tpl-memory", 540, 240, {
          label: "Memory",
          subtitle: "Save to agent memory",
          params: { text: `${self} staked SUI to a validator.` },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-sui", ORANGE, "STAKE"),
        mkEdge("te2", "tpl-sui", "tpl-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },

  // 10) DeFi swap — Trigger -> Sui (DEX swap) -> Memory.
  {
    id: "defi-swap",
    name: "DeFi swap",
    category: "DeFi",
    description:
      "Swap one coin for another on a DEX (DeepBook/Cetus pool::swap; placeholder package), then remember the trade. Skips until you set a real pool package.",
    demonstrates:
      "Trigger -> Sui (a DEX pool::swap move-call — placeholder DeepBook/Cetus package, pool id + amount-in + min-out seeded as params) -> Memory (save a recallable note like 'swapped X for Y'). The Sui node skips cleanly until 0xYOUR_DEX is swapped for a real published pool package; Memory skips when MEMWAL is unset.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-sui", 300, 240, {
          label: "Sui",
          subtitle: "DEX swap — set your pool pkg",
          params: {
            movePackage: DEX_PACKAGE_PLACEHOLDER,
            entry: DEX_SWAP_ENTRY,
            pool: "0xPOOL_OBJECT_ID",
            amountIn: "1000000000",
            minOut: "0",
          },
        }),
        mkNode("tpl-memory", 540, 240, {
          label: "Memory",
          subtitle: "Save to agent memory",
          params: { text: `${self} swapped tokens on a DEX pool.` },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-sui", ORANGE, "SWAP"),
        mkEdge("te2", "tpl-sui", "tpl-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },

  // 11) Add liquidity — Trigger -> Sui (LP add) -> Attest.
  {
    id: "defi-add-liquidity",
    name: "Add liquidity",
    category: "DeFi",
    description:
      "Provide liquidity to a DEX pool (placeholder pool::add_liquidity), then attest the position. Skips until you set a real pool package.",
    demonstrates:
      "Trigger -> Sui (a pool::add_liquidity move-call — placeholder DEX package, pool id + both coin amounts seeded as params) -> Attest (record the LP position in reputation). The Sui node skips cleanly until 0xYOUR_DEX is a real pool package; Attest skips until an AGENTOS package id is set.",
    build: () => {
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-sui", 300, 240, {
          label: "Sui",
          subtitle: "Add liquidity — set pool pkg",
          params: {
            movePackage: DEX_PACKAGE_PLACEHOLDER,
            entry: LP_ENTRY,
            pool: "0xPOOL_OBJECT_ID",
            amountA: "1000000000",
            amountB: "1000000000",
          },
        }),
        mkNode("tpl-attest", 540, 240, {
          label: "Attest",
          subtitle: "Reputation",
          params: { kind: "liquidity", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-sui", ORANGE, "ADD-LP"),
        mkEdge("te2", "tpl-sui", "tpl-attest", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },

  // ========================================================================
  // Token & NFT
  // ========================================================================

  // 12) Transfer SUI — Trigger -> Sui (split + transfer) -> Memory.
  {
    id: "token-transfer-sui",
    name: "Transfer SUI",
    category: "Token & NFT",
    description:
      "Split a coin and transfer SUI to a recipient (standard framework pay/transfer), then remember it. Configurable amount + recipient; skips until a real package is set.",
    demonstrates:
      "Trigger -> Sui (a coin split + transfer via the STANDARD framework — recipient address + amount in MIST seeded as params) -> Memory (save a recallable 'sent N SUI to X' note). The Sui node skips cleanly until 0xYOUR_FRAMEWORK is swapped for the real 0x2 framework + a bound-args entry; Memory skips when MEMWAL is unset.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-sui", 300, 240, {
          label: "Sui",
          subtitle: "Transfer SUI — set framework",
          params: {
            movePackage: TRANSFER_PACKAGE_PLACEHOLDER,
            entry: TRANSFER_ENTRY,
            recipient: "0xRECIPIENT_ADDRESS",
            amountMist: "1000000000",
          },
        }),
        mkNode("tpl-memory", 540, 240, {
          label: "Memory",
          subtitle: "Save to agent memory",
          params: { text: `${self} transferred SUI to a recipient.` },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-sui", ORANGE, "TRANSFER"),
        mkEdge("te2", "tpl-sui", "tpl-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },

  // 13) Airdrop — Trigger -> Sui (multi-recipient transfer) -> Attest.
  {
    id: "token-airdrop",
    name: "Airdrop",
    category: "Token & NFT",
    description:
      "Distribute a coin to many recipients in one move-call (placeholder airdrop::send), then attest. Recipients + per-wallet amount seeded; skips until a real package is set.",
    demonstrates:
      "Trigger -> Sui (a multi-recipient airdrop move-call — comma-separated recipient list + per-wallet amount seeded as params) -> Attest (record the distribution in reputation). The Sui node skips cleanly until 0xYOUR_FRAMEWORK is a real airdrop package; Attest skips until an AGENTOS package id is set.",
    build: () => {
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-sui", 300, 240, {
          label: "Sui",
          subtitle: "Airdrop — set your package",
          params: {
            movePackage: TRANSFER_PACKAGE_PLACEHOLDER,
            entry: AIRDROP_ENTRY,
            recipients: "0xWALLET_A,0xWALLET_B,0xWALLET_C",
            amountEach: "100000000",
          },
        }),
        mkNode("tpl-attest", 540, 240, {
          label: "Attest",
          subtitle: "Reputation",
          params: { kind: "airdrop", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-sui", ORANGE, "AIRDROP"),
        mkEdge("te2", "tpl-sui", "tpl-attest", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },

  // 14) Mint NFT -> Kiosk — Trigger -> Sui (mint) -> Sui (kiosk list) -> Memory.
  {
    id: "nft-mint-kiosk",
    name: "Mint NFT -> Kiosk",
    category: "Token & NFT",
    description:
      "Mint an NFT (placeholder NFT package) then list it in a Kiosk (placeholder 0x2::kiosk), and remember it. Both Sui nodes skip until real packages are set.",
    demonstrates:
      "Trigger -> Sui (mint NFT move-call — your published NFT package::function) -> Sui (kiosk::list move-call — kiosk id + price seeded as params; real target is the standard 0x2::kiosk) -> Memory (save 'minted + listed NFT' note). Each Sui node skips cleanly until its placeholder package is swapped for a real 0x… package; Memory skips when MEMWAL is unset.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 40, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-mint", 240, 240, {
          label: "Sui",
          subtitle: "Mint NFT — set your package",
          params: {
            movePackage: NFT_MINT_PACKAGE_PLACEHOLDER,
            entry: NFT_MINT_ENTRY_PLACEHOLDER,
          },
        }),
        mkNode("tpl-list", 460, 240, {
          label: "Sui",
          subtitle: "Kiosk list — set 0x2::kiosk",
          params: {
            movePackage: KIOSK_PACKAGE_PLACEHOLDER,
            entry: KIOSK_LIST_ENTRY,
            kiosk: "0xKIOSK_OBJECT_ID",
            priceMist: "1000000000",
          },
        }),
        mkNode("tpl-memory", 700, 240, {
          label: "Memory",
          subtitle: "Save to agent memory",
          params: { text: `${self} minted an NFT and listed it in a Kiosk.` },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-mint", ORANGE, "MINT"),
        mkEdge("te2", "tpl-mint", "tpl-list", ORANGE, "LIST"),
        mkEdge("te3", "tpl-list", "tpl-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },

  // ========================================================================
  // DAO & Multi-agent
  // ========================================================================

  // 15) DAO vote — Trigger -> Sui (governance vote) -> Attest.
  {
    id: "dao-vote",
    name: "DAO vote",
    category: "DAO & Multi-agent",
    description:
      "Cast a governance vote on a proposal (placeholder governance::vote), then attest the vote. Proposal id + choice seeded; skips until a real DAO package is set.",
    demonstrates:
      "Trigger -> Sui (a DAO governance::vote move-call — proposal id + yes/no choice seeded as params) -> Attest (record the vote in reputation). The Sui node skips cleanly until 0xYOUR_DAO is swapped for a real governance package; Attest skips until an AGENTOS package id is set.",
    build: () => {
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-sui", 300, 240, {
          label: "Sui",
          subtitle: "DAO vote — set your DAO pkg",
          params: {
            movePackage: DAO_PACKAGE_PLACEHOLDER,
            entry: DAO_VOTE_ENTRY,
            proposal: "0xPROPOSAL_OBJECT_ID",
            choice: "yes",
          },
        }),
        mkNode("tpl-attest", 540, 240, {
          label: "Attest",
          subtitle: "Reputation",
          params: { kind: "governance", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-sui", ORANGE, "VOTE"),
        mkEdge("te2", "tpl-sui", "tpl-attest", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },

  // 16) Agent buys skill — Import Agent -> Sui (pay seller) -> Call Sub-Agent -> Attest.
  {
    id: "marketplace-buy-skill",
    name: "Agent buys skill",
    category: "DAO & Multi-agent",
    description:
      "The multi-agent marketplace loop: read a seller's catalog, pay the seller, invoke the purchased skill, then attest. Coordinate nodes skip cleanly without an on-chain package.",
    demonstrates:
      "Trigger -> Import Agent (read the SELLER's published skill catalog, hash-verified, read-only) -> Sui (pay/transfer to the seller — placeholder marketplace package, seller address + price seeded as params) -> Call Sub-Agent (invoke the just-purchased skill via the existing delegated-exec node) -> Attest (rate the purchase). The full agent-to-agent marketplace flow built only from existing coordinate nodes; each on-chain node skips cleanly until env/packages are set.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 40, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-import", 240, 240, {
          label: "Import Agent",
          subtitle: "Read seller catalog",
          params: { agent: self },
        }),
        mkNode("tpl-pay", 460, 240, {
          label: "Sui",
          subtitle: "Pay seller — set marketplace",
          params: {
            movePackage: MARKETPLACE_PACKAGE_PLACEHOLDER,
            entry: MARKETPLACE_BUY_ENTRY,
            seller: "0xSELLER_ADDRESS",
            priceMist: "1000000000",
          },
        }),
        mkNode("tpl-call", 680, 240, {
          label: "Call Sub-Agent",
          subtitle: "Invoke purchased skill",
          // A REAL seeded skill the agent owns, so resolveSkill succeeds and the
          // delegated-exec accounting can run (not `self`/the agent name).
          params: { skill: defaultSkillFor(agentName), cost: "0" },
        }),
        mkNode("tpl-attest", 900, 240, {
          label: "Attest",
          subtitle: "Reputation",
          params: { kind: "purchase", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-import", PINK),
        mkEdge("te2", "tpl-import", "tpl-pay", ORANGE, "PAY"),
        mkEdge("te3", "tpl-pay", "tpl-call", PINK, "INVOKE"),
        mkEdge("te4", "tpl-call", "tpl-attest", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },

  // ========================================================================
  // Agent Memory
  // ========================================================================

  // 17) Daily portfolio rebalance — recall -> Sui rebalance -> remember + Harbor.
  {
    id: "memory-daily-rebalance",
    name: "Daily portfolio rebalance",
    category: "Agent Memory",
    description:
      "Recall yesterday's notes, rebalance the portfolio on-chain, remember today's result, and lock the report in Harbor.",
    demonstrates:
      "Trigger (run daily via an external cron hitting the run API) -> Memory Recall (semantic-search yesterday's notes INTO the graph) -> Sui (record_execution against a real seeded AgentPassport — a genuine on-chain call out of the box) -> { Memory (remember today's result, real Walrus blobId), Harbor (Seal-encrypt the report, locked to the owner agent's bucket policy) } running in PARALLEL off the Sui step. Five blocks; Memory Recall/Memory land real Walrus blob ids on Walruscan, Sui lands a real tx digest on Suiscan, and Harbor never blocks on a Memwal outage because it does not sit downstream of Memory — swap the Sui node's `passportId` for your own minted passport (or movePackage/entry for a real vault contract) once you have one.",
    build: (agentName) => {
      const self = selfName(agentName);
      const namespace = `portfolio.${self}`;
      const nodes: Node[] = [
        mkNode("tpl-trigger", 20, 240, {
          label: "Trigger",
          subtitle: "Daily 9AM (external cron)",
        }),
        mkNode("tpl-recall", 220, 240, {
          label: "Memory Recall",
          subtitle: "Recall yesterday's notes",
          params: {
            namespace,
            query: "yesterday's rebalance result",
            limit: "3",
          },
        }),
        mkNode("tpl-sui", 440, 240, {
          label: "Sui",
          // Uses a REAL seeded passport id (alpha.sui) as a runnable demo
          // default — record_execution needs an AgentPassport object that
          // actually exists on testnet. Swap `passportId` for your own minted
          // passport (or add movePackage/entry) once you have one.
          subtitle: "Record execution — demo passport",
          params: { passportId: DEMO_PASSPORT_ID },
        }),
        mkNode("tpl-memory", 680, 120, {
          label: "Memory",
          subtitle: "Remember today's result",
          params: {
            namespace,
            template: "Rebalanced on {{tpl-sui.digest}}: target allocation 60/40",
          },
        }),
        mkNode("tpl-harbor", 680, 360, {
          label: "Harbor",
          subtitle: "Lock report to owner",
          params: {
            private: "true",
            sealPolicyId: "demo-policy",
            manifest: JSON.stringify({
              report: "daily-rebalance",
              agent: self,
            }),
          },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-recall", PURPLE, "RECALL"),
        mkEdge("te2", "tpl-recall", "tpl-sui", ORANGE, "REBALANCE"),
        // Memory and Harbor branch in PARALLEL off Sui — Harbor is never
        // downstream of Memory, so a Memwal outage (memory errors) cannot
        // BLOCKED_UPSTREAM the Harbor node.
        mkEdge("te3", "tpl-sui", "tpl-memory", PURPLE, "REMEMBER"),
        mkEdge("te4", "tpl-sui", "tpl-harbor", PURPLE, "LOCK"),
      ];
      return { nodes, edges };
    },
  },

  // 18) Cross-agent skill composition — Sui skill + Walrus Memory skill under one cap.
  {
    id: "memory-cross-agent-composition",
    name: "Cross-agent skill composition",
    category: "Agent Memory",
    description:
      "Delegate once, then call a Sui on-chain skill AND a Walrus-Memory skill from two different agents under the SAME DelegationCap, merge results into memory, and attest both.",
    demonstrates:
      "Trigger -> Import Agent (read a DeFi agent's catalog) -> Delegate (grant one DelegationCap) -> Call Sub-Agent (SKILL 1: the DeFi agent's on-chain vault skill, delegated) -> Import Agent (read a memory-bot agent's catalog) -> Call Sub-Agent (SKILL 2: the memory-bot's Walrus-Memory skill, SAME delegated cap threaded automatically) -> Memory (merge both results into the orchestrator's own namespace) -> Attest x2 (rate both collaborators). Two heterogeneous skills — one Sui Move package, one Walrus-Memory-backed — composed atomically under a single on-chain grant; every Call Sub-Agent step is a real assert_valid -> entry -> consume -> record_subagent_execution PTB traceable on Suiscan.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 0, 260, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-import-defi", 200, 120, {
          label: "Import Agent",
          subtitle: "Read DeFi agent catalog",
          params: { agent: defaultImportTargetFor(agentName) },
        }),
        mkNode("tpl-delegate", 420, 260, {
          label: "Delegate",
          subtitle: "Grant one cap for both calls",
          params: {
            child: self,
            spendLimit: "0",
            expiryMs: DEMO_EXPIRY_MS,
          },
        }),
        mkNode("tpl-call-sui-skill", 660, 120, {
          label: "Call Sub-Agent",
          subtitle: "SKILL 1: Sui vault skill (delegated)",
          params: { skill: defaultSkillFor(agentName), cost: "0" },
        }),
        mkNode("tpl-import-memory", 660, 400, {
          label: "Import Agent",
          subtitle: "Read memory-bot catalog",
          params: { agent: defaultImportTargetFor(agentName) },
        }),
        mkNode("tpl-call-memory-skill", 900, 400, {
          label: "Call Sub-Agent",
          subtitle: "SKILL 2: Walrus-Memory skill (same cap)",
          params: { skill: defaultSkillFor(agentName), cost: "0" },
        }),
        mkNode("tpl-memory-merge", 1140, 260, {
          label: "Memory",
          subtitle: "Merge both results",
          params: {
            namespace: self,
            template:
              "Sui skill tx {{tpl-call-sui-skill.digest}}; Memory skill tx {{tpl-call-memory-skill.digest}}",
          },
        }),
        mkNode("tpl-attest-defi", 1380, 120, {
          label: "Attest",
          subtitle: "Rate the DeFi agent",
          params: { kind: "completion", score: "95", share: "true" },
        }),
        mkNode("tpl-attest-memory", 1380, 400, {
          label: "Attest",
          subtitle: "Rate the memory-bot agent",
          params: { kind: "completion", score: "95", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-import-defi", PINK),
        mkEdge("te2", "tpl-trigger", "tpl-delegate", PINK, "GRANT"),
        mkEdge("te3", "tpl-import-defi", "tpl-call-sui-skill", PINK, "DELEGATED"),
        mkEdge("te4", "tpl-delegate", "tpl-call-sui-skill", PINK),
        mkEdge("te5", "tpl-delegate", "tpl-call-memory-skill", PINK, "SAME CAP"),
        mkEdge("te6", "tpl-trigger", "tpl-import-memory", PINK),
        mkEdge(
          "te7",
          "tpl-import-memory",
          "tpl-call-memory-skill",
          PINK,
          "DELEGATED",
        ),
        mkEdge("te8", "tpl-call-sui-skill", "tpl-memory-merge", PURPLE, "MERGE"),
        mkEdge(
          "te9",
          "tpl-call-memory-skill",
          "tpl-memory-merge",
          PURPLE,
          "MERGE",
        ),
        mkEdge("te10", "tpl-memory-merge", "tpl-attest-defi", PINK, "ATTEST"),
        mkEdge("te11", "tpl-memory-merge", "tpl-attest-memory", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },

  // 19) Sui subagent showcase — 3 parallel branches, all REAL on-chain/off-chain
  // work, converging on one Attest. No delegation chain, no Memwal write, no
  // Harbor download — every node here is independently runnable the moment an
  // agent has a minted AgentPassport, which sidesteps the coordinate-loop's
  // delegation-cap dependency chain while still proving 3 different real
  // capabilities side by side.
  {
    id: "sui-subagent-showcase",
    name: "Sui subagent showcase",
    category: "DAO & Multi-agent",
    description:
      "Three independent branches run in PARALLEL off one Trigger — a real Sui move-call, a real cross-agent skill-catalog import, and a real private Harbor upload — then converge on a single Attest. Every step lands a genuine tx/blob; nothing here depends on Walrus Memory or a Harbor download.",
    demonstrates:
      "Trigger -> { Sui (record_execution on this agent's own minted AgentPassport — a REAL move-call against the published 0x6cc3… AgentOS package), Import Agent (read another agent's REAL published skill catalog, hash-verified), Harbor (Seal-encrypt + upload a report — upload-only, no download in the loop) } running in PARALLEL -> Attest (close the loop with a REAL on-chain reputation record referencing the Sui branch's passport). Built to showcase 3 independently-verifiable on-chain/off-chain capabilities as one big workflow without requiring a DelegationCap chain (which needs a passport BEFORE it can run) or a working Walrus Memory relayer — every node here either lands a real Suiscan-traceable tx or a real Harbor/Walrus blob out of the box, once the agent has a minted passport (Create Agent mints one automatically).",
    build: (agentName) => {
      const self = selfName(agentName);
      const importTarget = defaultImportTargetFor(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 40, 260, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-sui-record", 300, 60, {
          label: "Sui",
          subtitle: "Record execution (own passport)",
        }),
        mkNode("tpl-import", 300, 260, {
          label: "Import Agent",
          subtitle: "Read another agent's catalog",
          params: { agent: importTarget },
        }),
        mkNode("tpl-harbor-upload", 300, 460, {
          label: "Harbor",
          subtitle: "Upload report (private)",
          params: {
            private: "true",
            sealPolicyId: "demo-policy",
            manifest: JSON.stringify({
              report: "sui-subagent-showcase",
              agent: self,
            }),
          },
        }),
        mkNode("tpl-attest", 620, 260, {
          label: "Attest",
          subtitle: "Close the loop",
          params: { kind: "review", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-sui-record", ORANGE, "RECORD"),
        mkEdge("te2", "tpl-trigger", "tpl-import", PINK, "IMPORT"),
        mkEdge("te3", "tpl-trigger", "tpl-harbor-upload", PURPLE, "UPLOAD"),
        mkEdge("te4", "tpl-sui-record", "tpl-attest", PINK, "ATTEST"),
        mkEdge("te5", "tpl-import", "tpl-attest", PINK, "ATTEST"),
        mkEdge("te6", "tpl-harbor-upload", "tpl-attest", PINK, "ATTEST"),
      ];
      return { nodes, edges };
    },
  },
];
