import Link from "next/link";

import {
  IconDatabase,
  IconPackage,
  IconTerminal,
  IconTrendingFlat,
  IconTrendingUp,
  type IconProps,
} from "./icons";

export type AgentCardData = {
  slug: string;
  displayName: string;
  version: string;
  network: "mainnet" | "testnet";
  metric: string;
  trend: "up" | "flat";
  icon: "package" | "terminal" | "database";
  verified?: boolean;
  reputationScore?: number;
  reputationTier?: "new" | "rising" | "trusted";
};

const iconMap: Record<
  AgentCardData["icon"],
  (props: IconProps) => React.ReactElement
> = {
  package: IconPackage,
  terminal: IconTerminal,
  database: IconDatabase,
};

const networkStyles = {
  mainnet: "bg-green-100 text-green-800 border-green-800",
  testnet: "bg-blue-100 text-blue-800 border-blue-800",
};

export function AgentCard({ agent }: { agent: AgentCardData }) {
  const Icon = iconMap[agent.icon];
  const TrendIcon = agent.trend === "up" ? IconTrendingUp : IconTrendingFlat;

  return (
    <Link
      href={`/agent/${agent.slug}`}
      className="group cursor-pointer border-2 border-pure-black bg-white p-6 neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_0_#000]"
    >
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="border-2 border-electric-purple bg-electric-purple/10 p-2 text-electric-purple">
            <Icon className="h-6 w-6" />
          </div>
          {agent.verified && (
            <span
              className="border-2 border-green-800 bg-green-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-green-800"
              aria-label="Verified agent"
            >
              ✓ VERIFIED
            </span>
          )}
        </div>
        <span
          className={`border-2 px-2 py-0.5 font-mono text-xs font-bold uppercase ${networkStyles[agent.network]}`}
        >
          {agent.network}
        </span>
      </div>
      <h3 className="mb-1 font-display text-2xl font-semibold transition-colors group-hover:text-electric-purple">
        {agent.displayName}
      </h3>
      <p className="mb-4 font-mono text-sm text-on-surface-variant">
        {agent.version}
      </p>
      <div className="flex items-center justify-between border-t-2 border-pure-black/5 pt-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold">{agent.metric}</span>
          {agent.reputationScore != null && agent.reputationScore > 0 && (
            <span className="border border-electric-purple/50 bg-electric-purple/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-electric-purple">
              {agent.reputationScore}
            </span>
          )}
        </div>
        <TrendIcon className="h-6 w-6 text-vibrant-blue" />
      </div>
    </Link>
  );
}
