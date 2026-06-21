import React from "react";

/**
 * A standout text section: a large paragraph where key AgentOS concepts are
 * rendered as inline, icon-bearing colored pills embedded in the sentence,
 * with muted gray lead-in / lead-out lines on a subtle dotted background.
 *
 * No interactivity, no window/WebGL — safe to render on the server.
 */

interface InlinePillProps {
  label: string;
  /** Tailwind background + text classes for the pill */
  className: string;
  icon: React.ReactNode;
}

function InlinePill({ label, className, icon }: InlinePillProps) {
  return (
    <span
      className={
        "mx-1 inline-flex translate-y-[0.12em] items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-pure-black px-3 py-0.5 align-baseline font-mono text-[0.7em] font-bold uppercase tracking-tight shadow-[2px_2px_0_0_#000] " +
        className
      }
    >
      <span className="flex h-[1.1em] w-[1.1em] items-center justify-center">
        {icon}
      </span>
      {label}
    </span>
  );
}

/* Compact inline icons (1em sized, currentColor) */
const ic = {
  passport: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 16h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  skills: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M12 2l2.6 6.3L21 9l-5 4.3L17.5 21 12 17.3 6.5 21 8 13.3 3 9l6.4-.7L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  delegation: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="18" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  walrus: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6" stroke="currentColor" strokeWidth="2" />
      <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  harbor: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" />
    </svg>
  ),
  workflows: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="3" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="15" y="15" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <path d="M9 6.5h4a2 2 0 0 1 2 2v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

export function InlinePillsText() {
  return (
    <section className="relative overflow-hidden border-t-2 border-pure-black bg-off-white py-24 md:py-36">
      {/* Subtle dotted background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: "radial-gradient(#00000022 1.2px, transparent 1.2px)",
          backgroundSize: "20px 20px",
        }}
      />
      <div className="relative z-10 mx-auto max-w-4xl px-margin">
        <p className="mb-6 font-mono text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant/60">
          What AgentOS gives every agent
        </p>
        <p className="font-display text-3xl font-medium leading-[1.5] tracking-tight text-pure-black md:text-[2.6rem] md:leading-[1.5]">
          <span className="text-on-surface-variant/50">
            AgentOS is the Sui-native identity layer for AI agents —
          </span>{" "}
          give every agent a
          <InlinePill
            label="AgentPassport"
            className="bg-electric-purple text-off-white"
            icon={ic.passport}
          />
          expose verifiable
          <InlinePill
            label="Skills"
            className="bg-vibrant-blue text-off-white"
            icon={ic.skills}
          />
          grant scoped
          <InlinePill
            label="Delegation"
            className="bg-soft-lavender text-pure-black"
            icon={ic.delegation}
          />
          store manifests on
          <InlinePill
            label="Walrus"
            className="bg-pure-black text-off-white"
            icon={ic.walrus}
          />
          seal private skills with
          <InlinePill
            label="Harbor"
            className="bg-[#13b981] text-off-white"
            icon={ic.harbor}
          />
          and run
          <InlinePill
            label="Workflows"
            className="bg-[#f59e0b] text-pure-black"
            icon={ic.workflows}
          />{" "}
          <span className="text-on-surface-variant/50">
            that settle on-chain — resolvable anywhere by a single *.sui name.
          </span>
        </p>
      </div>
    </section>
  );
}

export default InlinePillsText;
