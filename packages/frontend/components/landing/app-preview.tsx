import type { ReactNode } from "react";

/* ------------------------------------------------------------------ */
/* AppPreview — learnhouse-style product "peek" for the hero bottom.    */
/*                                                                      */
/* A browser-window-framed, stylized AgentOS workflow canvas, rendered  */
/* purely with HTML/CSS/SVG (no screenshot asset, no `window` access),  */
/* so it is fully SSR-safe and ships in the server bundle. The parent   */
/* hero positions this so it rises from the bottom edge, partially cut  */
/* off (peeking into view) — the signature learnhouse hero element.     */
/* ------------------------------------------------------------------ */

/* Small inline node glyphs (lucide-react is not a dependency here). */
const nodeIcon = {
  trigger: (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  import: (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <path d="M12 3v12m0 0 4-4m-4 4-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  delegate: (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <circle cx="6" cy="12" r="2.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="6" r="2.2" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="18" r="2.2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 10.9 16 7m-8 6.1L16 17" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  call: (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <path d="m8 18-6-6 6-6m8 0 6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  attest: (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <path d="M12 3 5 6v5c0 4.5 3 8 7 10 4-2 7-5.5 7-10V6l-7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  walrus: (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <ellipse cx="12" cy="6" rx="6.5" ry="2.6" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 6v12c0 1.5 2.9 2.6 6.5 2.6s6.5-1.1 6.5-2.6V6" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 12c0 1.5 2.9 2.6 6.5 2.6s6.5-1.1 6.5-2.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  harbor: (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" />
    </svg>
  ),
  memory: (
    <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5">
      <rect x="4" y="6" width="16" height="12" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M8 3v3m4-3v3m4-3v3M8 18v3m4-3v3m4-3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

/* A single rounded node card in the canvas. */
function NodeCard({
  icon,
  label,
  sub,
  accent = false,
}: {
  icon: ReactNode;
  label: string;
  sub: string;
  accent?: boolean;
}) {
  return (
    <div
      className={[
        "flex min-w-[124px] flex-col gap-1 rounded-md border-2 border-pure-black px-3 py-2 shadow-[3px_3px_0_0_#000]",
        accent ? "bg-electric-purple text-off-white" : "bg-off-white text-pure-black",
      ].join(" ")}
    >
      <div className="flex items-center gap-1.5">
        <span className={accent ? "text-soft-lavender" : "text-electric-purple"}>{icon}</span>
        <span className="font-mono text-[11px] font-bold uppercase tracking-tight">{label}</span>
      </div>
      <span
        className={[
          "font-mono text-[9px] uppercase tracking-tight",
          accent ? "text-off-white/70" : "text-on-surface-variant/70",
        ].join(" ")}
      >
        {sub}
      </span>
    </div>
  );
}

export function AppPreview() {
  return (
    <div
      aria-hidden
      className="pointer-events-none w-full select-none"
      style={{ perspective: "1600px" }}
    >
      {/* The browser window, tilted slightly back for the product-peek look. */}
      <div
        className="mx-auto w-full max-w-4xl origin-bottom border-2 border-pure-black bg-off-white shadow-[8px_8px_0_0_#000]"
        style={{ transform: "rotateX(6deg)" }}
      >
        {/* Browser chrome: traffic-light dots + URL bar. */}
        <div className="flex items-center gap-3 border-b-2 border-pure-black bg-pure-black px-4 py-2.5">
          <div className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full border-2 border-off-white/80" />
            <span className="h-3 w-3 rounded-full border-2 border-off-white/80" />
            <span className="h-3 w-3 rounded-full border-2 border-off-white/80" />
          </div>
          <div className="flex flex-1 items-center gap-2 rounded-sm border-2 border-off-white/30 bg-off-white/10 px-3 py-1">
            <svg viewBox="0 0 24 24" fill="none" className="h-3 w-3 text-soft-lavender">
              <rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" strokeWidth="2.2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2.2" />
            </svg>
            <span className="truncate font-mono text-[11px] font-bold tracking-tight text-off-white/90">
              sui-ns-agent-os.app/create/alpha
            </span>
          </div>
          <span className="hidden font-mono text-[10px] font-bold uppercase tracking-tight text-off-white/50 sm:inline">
            Workflow Canvas
          </span>
        </div>

        {/* Canvas body: dotted grid + node graph. */}
        <div
          className="relative overflow-hidden bg-off-white px-6 py-7 sm:px-10 sm:py-9"
          style={{
            backgroundImage:
              "radial-gradient(circle, rgba(0,0,0,0.14) 1px, transparent 1px)",
            backgroundSize: "20px 20px",
          }}
        >
          {/* Canvas toolbar label. */}
          <div className="mb-6 flex items-center justify-between">
            <div className="inline-flex items-center gap-2 border-2 border-pure-black bg-off-white px-2.5 py-1 font-mono text-[10px] font-bold uppercase tracking-tight text-pure-black shadow-[2px_2px_0_0_#000]">
              <span className="h-1.5 w-1.5 rounded-full bg-electric-purple" />
              alpha.sui · agent passport
            </div>
            <span className="hidden font-mono text-[10px] font-bold uppercase tracking-tight text-on-surface-variant/60 sm:inline">
              4 nodes · 3 stores
            </span>
          </div>

          {/* Edges drawn behind the nodes. */}
          <div className="relative">
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full text-pure-black/40"
              preserveAspectRatio="none"
              viewBox="0 0 100 100"
              fill="none"
            >
              {/* Top coordinate row: Import -> Delegate -> Call -> Attest */}
              <path d="M16 22 H38" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 2" />
              <path d="M50 22 H62" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 2" />
              <path d="M74 22 H86" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 2" />
              {/* Fan-out from the flow down into the storage row. */}
              <path d="M27 30 C27 50 18 55 18 70" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 2" />
              <path d="M50 30 C50 52 50 55 50 70" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 2" />
              <path d="M80 30 C80 52 82 55 82 70" stroke="currentColor" strokeWidth="0.6" strokeDasharray="2 2" />
            </svg>

            {/* Top flow row — the Import -> Delegate -> Call -> Attest coordinate flow. */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
              <NodeCard icon={nodeIcon.import} label="Import" sub="SKILL.md" />
              <NodeCard icon={nodeIcon.delegate} label="Delegate" sub="sub-agent" accent />
              <NodeCard icon={nodeIcon.call} label="Call" sub="module::fn" />
              <NodeCard icon={nodeIcon.attest} label="Attest" sub="on-chain" />
            </div>

            {/* Storage / memory row. */}
            <div className="relative z-10 mt-12 flex flex-wrap items-center justify-between gap-3">
              <NodeCard icon={nodeIcon.walrus} label="Walrus" sub="manifest blob" />
              <NodeCard icon={nodeIcon.harbor} label="Harbor" sub="seal-encrypted" />
              <NodeCard icon={nodeIcon.memory} label="Memory" sub="agent state" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AppPreview;
