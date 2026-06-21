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
  | "DAO & Multi-agent";

/** Stable display order for the categorized Templates dropdown. */
export const CATEGORY_ORDER: TemplateCategory[] = [
  "Core",
  "DeFi",
  "Token & NFT",
  "DAO & Multi-agent",
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

// Illustrative NFT metadata payload (the thing a Harbor node stores for an NFT
// mint). Plain JSON the Harbor executor uploads verbatim as the encrypted blob.
function nftMetadataParam(self: string): string {
  return JSON.stringify({
    name: `${self} NFT`,
    description: "Demo NFT metadata archived by an AgentOS workflow.",
    image: "walrus://<image-blob-id>",
    attributes: [{ trait_type: "minted_by", value: self }],
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
    name: "Store + Encrypt + Remember (DEMO)",
    description:
      "Walrus STORES the file (returns a blobId); Harbor AES-encrypts (DEMO — not real Seal); Memory saves a short recallable NOTE about it.",
    demonstrates:
      "Trigger -> Walrus (store the file blob on decentralized storage) -> Harbor (DEMO AES stand-in, NOT real Seal threshold encryption) -> Memory (save a short fact to agent memory). Walrus = a FILE/BLOB; Memory = a recallable NOTE — two different stores, not a duplicate.",
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
          subtitle: "Encrypt + store (DEMO)",
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
    name: "Encrypted manifest pipeline (DEMO)",
    description:
      "AES-encrypt a manifest (DEMO — not real Seal), then record on-chain.",
    demonstrates:
      "Trigger -> Harbor (DEMO AES stand-in, NOT real Seal) -> Sui (record_execution PTB). The private-skill publish path.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-harbor", 300, 240, {
          label: "Harbor",
          subtitle: "Encrypt + store (DEMO)",
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

  // 7) NFT -> Harbor -> Memory — mint an NFT, archive its metadata, remember it.
  {
    id: "nft-harbor-memory",
    name: "NFT -> Harbor -> Memory",
    description:
      "Mint an NFT (fill in your NFT package), archive its metadata to Harbor (DEMO encrypt + REAL upload when HARBOR_API_KEY is set), then save a recallable note.",
    demonstrates:
      "Trigger -> Sui (mint NFT move-call — seed your published NFT package::function) -> Harbor (store the NFT metadata blob; real Harbor upload when configured) -> Memory (save a short fact like 'minted NFT X'). Sui skips cleanly until you paste a real 0x package; Harbor falls back to Walrus and Memory skips when env is unset — the whole chain stays runnable.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 40, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-mint", 240, 240, {
          label: "Sui",
          // Hint lives in the subtitle so the chain reads as a mint at a glance.
          subtitle: "Mint NFT — set your package",
          params: {
            movePackage: NFT_MINT_PACKAGE_PLACEHOLDER,
            entry: NFT_MINT_ENTRY_PLACEHOLDER,
          },
        }),
        mkNode("tpl-harbor", 460, 240, {
          label: "Harbor",
          subtitle: "Archive NFT metadata (DEMO)",
          params: {
            private: "true",
            sealPolicyId: "demo-policy",
            manifest: nftMetadataParam(self),
            filename: `${self}-nft.json`,
          },
        }),
        mkNode("tpl-memory", 700, 240, {
          label: "Memory",
          subtitle: "Save to agent memory",
          params: { text: `Minted NFT for ${self} and archived its metadata.` },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-mint", ORANGE, "MINT"),
        mkEdge("te2", "tpl-mint", "tpl-harbor", PURPLE, "ARCHIVE"),
        mkEdge("te3", "tpl-harbor", "tpl-memory", PURPLE, "REMEMBER"),
      ];
      return { nodes, edges };
    },
  },

  // 8) Mint + archive NFT — mint then archive the metadata to Harbor.
  {
    id: "mint-archive-nft",
    name: "Mint + archive NFT",
    description:
      "Mint an NFT on-chain (fill in your NFT package), then archive its metadata blob to Harbor (DEMO encrypt + REAL upload when HARBOR_API_KEY is set).",
    demonstrates:
      "Trigger -> Sui (mint NFT move-call — paste your published NFT package::function) -> Harbor (store the NFT metadata file; real Harbor upload when HARBOR_API_KEY/SPACE/BUCKET are set, else a Walrus fallback). The minimal mint-then-archive path; the Sui node skips cleanly until a real 0x package is supplied.",
    build: (agentName) => {
      const self = selfName(agentName);
      const nodes: Node[] = [
        mkNode("tpl-trigger", 60, 240, {
          label: "Trigger",
          subtitle: "Manual start",
        }),
        mkNode("tpl-mint", 300, 240, {
          label: "Sui",
          subtitle: "Mint NFT — set your package",
          params: {
            movePackage: NFT_MINT_PACKAGE_PLACEHOLDER,
            entry: NFT_MINT_ENTRY_PLACEHOLDER,
          },
        }),
        mkNode("tpl-harbor", 540, 240, {
          label: "Harbor",
          subtitle: "Archive NFT metadata (DEMO)",
          params: {
            private: "true",
            sealPolicyId: "demo-policy",
            manifest: nftMetadataParam(self),
            filename: `${self}-nft.json`,
          },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-mint", ORANGE, "MINT"),
        mkEdge("te2", "tpl-mint", "tpl-harbor", PURPLE, "ARCHIVE"),
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
      "Delegate-stake SUI to a validator (0x3::sui_system::request_add_stake), then attest the action. Skips until you set a real 0x3 package + validator.",
    demonstrates:
      "Trigger -> Sui (the STANDARD staking call 0x3::sui_system::request_add_stake — validator address + amount seeded as params) -> Attest (record the stake in reputation). The Sui node skips cleanly until the placeholder package is swapped for the real 0x3 system package (the executor binds no args yet, so seed a no-arg entry or wire args to truly submit); Attest skips until an AGENTOS package id is set — the whole graph stays a clean run.",
    build: () => {
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
        mkNode("tpl-attest", 540, 240, {
          label: "Attest",
          subtitle: "Reputation",
          params: { kind: "stake", score: "100", share: "true" },
        }),
      ];
      const edges: Edge[] = [
        mkEdge("te1", "tpl-trigger", "tpl-sui", ORANGE, "STAKE"),
        mkEdge("te2", "tpl-sui", "tpl-attest", PINK, "ATTEST"),
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
];
