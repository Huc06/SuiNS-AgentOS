"use client";

import { HeroSearch } from "./hero-search";

export function Hero() {
  return (
    <section className="relative overflow-hidden bg-off-white py-20 md:py-32">
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
              SuiNS AgentOS is the identity, wallet, skill registry, and
              delegation layer for AI agents on Sui — permissioned, composable,
              and resolvable by name.
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
                <div className="mb-1 text-[10px] uppercase text-soft-lavender/60">
                  — illustrative —
                </div>
                <div className="mb-2 text-soft-lavender">AGENT_PASSPORT</div>
                <div>suins: your-agent.sui</div>
                <div>status: active</div>
                <div>skills: N · delegates: N</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
