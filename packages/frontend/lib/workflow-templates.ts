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

export type WorkflowTemplate = {
  /** Stable id (used as the dropdown key). */
  id: string;
  /** Short human name shown in the dropdown. */
  name: string;
  /** One-line description shown under the name. */
  description: string;
  /** What this template shows off (longer; used as a tooltip / aria-label). */
  demonstrates: string;
  /** Build the concrete graph, seeded with the current agent's `.sui` name. */
  build: (agentName: string) => TemplateGraph;
};

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
          params: { child: self, spendLimit: "0", expiryMs: "0" },
        }),
        mkNode("tpl-call", 680, 240, {
          label: "Call Sub-Agent",
          subtitle: "Delegated exec",
          params: { skill: self, cost: "0" },
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
];
