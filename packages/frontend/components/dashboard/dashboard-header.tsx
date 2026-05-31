type DashboardHeaderProps = {
  onCreateAgent?: () => void;
};

export function DashboardHeader({ onCreateAgent }: DashboardHeaderProps) {
  return (
    <div className="mb-16">
      <div className="mb-12 flex flex-col items-end justify-between gap-6 md:flex-row">
        <div className="flex max-w-2xl flex-col gap-2">
          <p className="font-mono text-sm font-bold uppercase tracking-widest text-electric-purple">
            Workspace
          </p>
          <h1 className="font-display text-4xl font-bold uppercase tracking-tight md:text-6xl lg:text-7xl">
            Create Agent
          </h1>
          <p className="font-mono text-base text-on-surface-variant">
            Connect your wallet, mint an AgentPassport, and bind a SuiNS name — your dashboard
            for managing agents and skills.
          </p>
        </div>
        <div className="flex shrink-0 gap-4">
          <button
            type="button"
            onClick={onCreateAgent}
            className="border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all active:translate-x-0.5 active:translate-y-0.5 active:shadow-[2px_2px_0_0_#000]"
          >
            New Agent
          </button>
          <button
            type="button"
            className="border-2 border-pure-black bg-white px-6 py-3 font-mono text-sm font-bold text-pure-black transition-colors hover:bg-surface-container"
          >
            Import Skill
          </button>
        </div>
      </div>
    </div>
  );
}
