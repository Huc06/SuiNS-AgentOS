import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Catalog of well-known Sui Agent Skills available for one-click import.
 *
 * SIMPLIFICATION: the public `docs.sui.io/skills` catalog has no guaranteed
 * machine-readable JSON API, and live-scraping documentation HTML from inside a
 * Next.js request would be brittle and slow. We therefore serve a small,
 * curated static list of well-known skills here. Each entry carries enough
 * metadata (id, name, description) for the import flow to construct a minimal
 * instruction-only manifest. Expand this list as the catalog grows, or replace
 * it with a real fetch once an official catalog API exists.
 *
 * SECURITY NOTE: this route is read-only and UNAUTHENTICATED. It exposes no
 * secrets and performs no mutations, so public exposure is low risk.
 */
export interface CatalogSkill {
  /** Stable identifier used as the skill name on import. */
  id: string;
  /** Human-readable display name. */
  name: string;
  /** Short description of what the skill does. */
  description: string;
  /** Origin tag — always `sui-skills` for catalog entries. */
  source: "sui-skills";
}

const CATALOG: CatalogSkill[] = [
  {
    id: "web-search",
    name: "Web Search",
    description:
      "Search the web and summarize results for grounding agent responses.",
    source: "sui-skills",
  },
  {
    id: "sui-docs",
    name: "Sui Docs Lookup",
    description:
      "Answer questions using the official Sui documentation as a source.",
    source: "sui-skills",
  },
  {
    id: "move-analyzer",
    name: "Move Analyzer",
    description:
      "Inspect and explain Move modules, structs, and entry functions.",
    source: "sui-skills",
  },
  {
    id: "defi-pricing",
    name: "DeFi Pricing",
    description:
      "Fetch on-chain token prices and pool data from Sui DeFi protocols.",
    source: "sui-skills",
  },
  {
    id: "wallet-balance",
    name: "Wallet Balance",
    description:
      "Read balances and owned objects for a given Sui address or SuiNS name.",
    source: "sui-skills",
  },
  {
    id: "nft-explorer",
    name: "NFT Explorer",
    description:
      "Browse NFT collections and metadata for objects owned by an address.",
    source: "sui-skills",
  },
];

export async function GET() {
  return NextResponse.json({ skills: CATALOG });
}
