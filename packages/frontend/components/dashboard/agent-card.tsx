import Link from "next/link";

export type AgentCardData = {
  slug: string;
  displayName: string;
  /** Fully-qualified SuiNS name, e.g. `alpha-fund.sui` (used to scope subnames). */
  suinsName?: string;
  version: string;
  network: "mainnet" | "testnet";
  metric: string;
  trend: "up" | "flat";
  icon: "package" | "terminal" | "database";
  verified?: boolean;
  reputationScore?: number;
  reputationTier?: "new" | "rising" | "trusted";
};

export function AgentCard({ agent }: { agent: AgentCardData }) {
  return (
    <Link
      href={`/agent/${agent.slug}`}
      className="group block border-2 border-pure-black bg-white p-6 neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_0_#000]"
    >
      <h3 className="font-display text-2xl font-semibold transition-colors group-hover:text-electric-purple">
        {agent.displayName}
      </h3>
    </Link>
  );
}
