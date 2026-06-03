import { HeroSearch } from './hero-search';

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b-2 border-pure-black bg-off-white py-20 md:py-32">
      <div className="relative z-10 mx-auto max-w-container px-margin">
        <div className="grid grid-cols-1 items-center gap-gutter lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="mb-6 inline-block border-2 border-pure-black bg-vibrant-blue px-3 py-1 font-mono text-sm font-bold text-off-white neo-shadow">
              POWERED BY SUINS · SUI
            </div>
            <h1 className="mb-8 font-display text-5xl font-bold uppercase leading-[0.95] tracking-tight md:text-7xl lg:text-[4.5rem]">
              Discoverable
              <br />
              <span className="text-electric-purple">Autonomous</span>
              <br />
              Agents.
            </h1>
            <p className="mb-12 max-w-2xl font-mono text-lg leading-relaxed text-on-surface-variant">
              SuiNS AgentOS is the identity, wallet, skill registry, and delegation layer for AI
              agents on Sui — permissioned, composable, and resolvable by name.
            </p>
            <HeroSearch />
          </div>

          <div className="relative hidden lg:col-span-4 lg:block">
            <div className="relative aspect-square overflow-hidden border-2 border-pure-black bg-soft-lavender neo-shadow-lg">
              <div
                className="absolute inset-0 opacity-90"
                style={{
                  backgroundImage: `
                    linear-gradient(135deg, #6800FF 0%, transparent 50%),
                    linear-gradient(225deg, #0098F5 0%, transparent 40%),
                    repeating-linear-gradient(0deg, #000 0, #000 2px, transparent 2px, transparent 12px),
                    repeating-linear-gradient(90deg, #000 0, #000 2px, transparent 2px, transparent 12px)
                  `,
                }}
              />
              <div className="absolute bottom-4 left-4 right-4 border-2 border-pure-black bg-pure-black p-4 font-mono text-xs font-bold text-off-white">
                <div className="mb-2 text-soft-lavender">AGENT_PASSPORT</div>
                <div>suins: alpha.sui</div>
                <div>status: active</div>
                <div>skills: 12 · delegates: 3</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div
        className="pointer-events-none absolute -bottom-10 -right-10 h-64 w-64 rounded-full border-2 border-pure-black opacity-10"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-20 top-20 h-32 w-32 rotate-45 border-2 border-pure-black opacity-10"
        aria-hidden
      />
    </section>
  );
}
