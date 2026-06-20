import Link from "next/link";

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

const networkStyles = {
  mainnet: "bg-green-100 text-green-800 border-green-800",
  testnet: "bg-blue-100 text-blue-800 border-blue-800",
};

export function AgentCard({ agent }: { agent: AgentCardData }) {
  return (
    <Link
      href={`/agent/${agent.slug}`}
      className="group block border-2 border-pure-black bg-white p-6 neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_0_#000]"
    >
      <div className="mb-6 flex items-start justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-10 w-10 items-center justify-center border-2 border-electric-purple bg-electric-purple/10 font-mono text-sm font-bold text-electric-purple">
            {agent.slug.charAt(0).toUpperCase()}
          </div>
          {agent.verified && (
            <span className="border-2 border-green-800 bg-green-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-green-800">
              ✓
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
        <span className="font-mono text-sm font-bold">{agent.metric}</span>
        {agent.reputationScore != null && agent.reputationScore > 0 && (
          <span className="border border-electric-purple/50 bg-electric-purple/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-electric-purple">
            {agent.reputationScore}
          </span>
        )}
      </div>
    </Link>
  );
}
