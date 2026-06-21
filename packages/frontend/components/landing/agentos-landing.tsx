"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import {
  RadialLiquidClient,
  ParallaxPillsClient,
  SquircleShiftClient,
  PortalClient,
} from "./landing-clients";
import { InlinePillsText } from "./inline-pills-text";
import { AppPreview } from "./app-preview";
import type { ParallaxPillItem } from "./parallax-pills";
import { ScrollReveal, RevealGroup, RevealChild } from "./scroll-reveal";
import { ScrollProgress } from "./scroll-progress";

/* ------------------------------------------------------------------ */
/* Small inline icons (no lucide-react dependency in this package)     */
/* ------------------------------------------------------------------ */

const icon = {
  passport: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 16h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  skills: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M12 2l2.6 6.3L21 9l-5 4.3L17.5 21 12 17.3 6.5 21 8 13.3 3 9l6.4-.7L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  delegation: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="18" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  walrus: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6" stroke="currentColor" strokeWidth="2" />
      <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  harbor: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" />
    </svg>
  ),
  workflows: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <rect x="3" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="15" y="15" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <path d="M9 6.5h4a2 2 0 0 1 2 2v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  attestation: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  arrow: (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4">
      <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
};

/* learnhouse-style feature nav: icon + label items, exactly one active. */
const FEATURE_NAV: { label: string; icon: ReactNode; active?: boolean }[] = [
  { label: "Passport", icon: icon.passport },
  { label: "Skills", icon: icon.skills },
  { label: "Delegation", icon: icon.delegation },
  { label: "Walrus", icon: icon.walrus },
  { label: "Harbor", icon: icon.harbor },
  { label: "Workflows", icon: icon.workflows, active: true },
  { label: "Attestation", icon: icon.attestation },
];

/* AgentOS concept pills for the parallax band — mono + accent palette */
const PARALLAX_PILLS: ParallaxPillItem[] = [
  { label: "AgentPassport", background: "#6800FF", color: "#FAF8F5", x: 28, y: 24, width: 30, rotate: -4 },
  { label: "Skills", background: "#FFFFFF", color: "#0A0A0A", x: 70, y: 20, width: 16, rotate: 3 },
  { label: "Delegation", background: "#0098F5", color: "#FAF8F5", x: 80, y: 38, width: 24, rotate: -2 },
  { label: "Walrus", background: "#0A0A0A", color: "#FAF8F5", x: 22, y: 52, width: 20, rotate: 2 },
  { label: "Harbor", background: "#CAB1FF", color: "#0A0A0A", x: 50, y: 50, width: 22, rotate: 5 },
  { label: "SuiNS", background: "#FFFFFF", color: "#0A0A0A", x: 78, y: 62, width: 18, rotate: -3 },
  { label: "Workflows", background: "#0A0A0A", color: "#FAF8F5", x: 34, y: 74, width: 26, rotate: 3 },
  { label: "Attestation", background: "#6800FF", color: "#FAF8F5", x: 66, y: 80, width: 28, rotate: -4 },
  { label: "On-chain", background: "#0098F5", color: "#FAF8F5", x: 14, y: 80, width: 22, rotate: 4 },
];

/* ------------------------------------------------------------------ */
/* Sections                                                            */
/* ------------------------------------------------------------------ */

function Hero() {
  return (
    <section className="relative min-h-[112svh] w-full overflow-hidden border-b-2 border-pure-black bg-off-white">
      {/* Atmospheric WebGL background (client-only) */}
      <div className="pointer-events-none absolute inset-0 z-0">
        <RadialLiquidClient
          width="100%"
          height="100%"
          distortionType="plasma"
          color1="#FAF8F5"
          color2="#1b1b1b"
          color3="#6800FF"
          backgroundColor="#FAF8F5"
          position="bottom"
          iterations={4}
          overallOpacity={0.34}
          speed={0.5}
          scale={1.15}
          waveSize={4.5}
          distortionScale={0.18}
          fresnelIntensity={0.25}
          edgeHighlight={0.2}
          refractionStrength={14}
          quality="high"
        />
      </div>

      {/* Hero content */}
      <div className="relative z-10 mx-auto flex min-h-[112svh] max-w-container flex-col px-margin pt-24 pb-0">
        {/* On-mount cascade: fires once after the preloader curtain lifts, so the
            hero "arrives" rather than snapping in. Uses animate (not whileInView)
            since the hero is above the fold. */}
        <RevealGroup
          onMount
          className="flex flex-1 flex-col justify-center"
          stagger={0.12}
          delayChildren={0.15}
        >
          <RevealChild as="div" className="w-fit">
            <div className="mb-8 inline-flex w-fit items-center gap-2 border-2 border-pure-black bg-off-white px-3 py-1 font-mono text-xs font-bold uppercase tracking-wide text-pure-black shadow-[2px_2px_0_0_#000]">
              <span className="h-2 w-2 animate-pulse rounded-full bg-electric-purple" />
              Sui-native · Powered by SuiNS
            </div>
          </RevealChild>

          <RevealChild
            as="h1"
            className="max-w-4xl font-display text-5xl font-bold uppercase leading-[0.92] tracking-tight text-pure-black sm:text-6xl md:text-8xl"
          >
            Identity for
            <br />
            AI Agents.
            <br />
            <span className="text-electric-purple">Openly yours.</span>
          </RevealChild>

          <RevealChild
            as="div"
            className="mt-10 grid max-w-5xl grid-cols-1 items-end gap-8 lg:grid-cols-2"
          >
            <p className="max-w-xl font-mono text-base leading-relaxed text-on-surface-variant md:text-lg">
              Sui-native identity, skills, delegation, and storage for autonomous
              agents. Every agent gets an on-chain{" "}
              <span className="font-bold text-pure-black">AgentPassport</span>,
              named by a single{" "}
              <span className="font-bold text-pure-black">*.sui</span> SuiNS name —
              resolvable, verifiable, and openly yours.
            </p>

            <div className="flex flex-wrap items-center gap-4 lg:justify-end">
              <Link
                href="/create"
                className="inline-flex items-center gap-2 border-2 border-pure-black bg-electric-purple px-7 py-4 font-mono text-sm font-bold uppercase text-off-white shadow-[4px_4px_0_0_#000] transition-transform neo-hover"
              >
                Launch App {icon.arrow}
              </Link>
              <Link
                href="/explore"
                className="inline-flex items-center gap-2 border-2 border-pure-black bg-off-white px-7 py-4 font-mono text-sm font-bold uppercase text-pure-black shadow-[4px_4px_0_0_#000] transition-transform neo-hover"
              >
                Explore agents
              </Link>
            </div>
          </RevealChild>

          {/* Feature nav — horizontal icon+label items, one active pill */}
          <RevealChild
            as="nav"
            aria-label="AgentOS primitives"
            className="mt-12 flex flex-wrap items-center gap-x-1 gap-y-2 border-y-2 border-pure-black/15 py-2"
          >
            {FEATURE_NAV.map((item) => (
              <span
                key={item.label}
                aria-current={item.active ? "true" : undefined}
                className={
                  item.active
                    ? "inline-flex items-center gap-2 border-2 border-pure-black bg-electric-purple px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-tight text-off-white shadow-[2px_2px_0_0_#000]"
                    : "inline-flex items-center gap-2 border-2 border-transparent px-3 py-1.5 font-mono text-xs font-bold uppercase tracking-tight text-on-surface-variant transition-colors hover:border-pure-black hover:bg-off-white hover:text-pure-black"
                }
              >
                <span className={item.active ? "text-soft-lavender" : "text-electric-purple"}>
                  {item.icon}
                </span>
                {item.label}
              </span>
            ))}
          </RevealChild>
        </RevealGroup>

        {/* Product preview — rises from the bottom, partially cut off (peek).
            Centered in its own max-w-4xl box that matches the AppPreview window
            width, so the peek and the next section share one centered column and
            line up cleanly (no stray padding / off-center drift). */}
        <div className="relative mx-auto mt-16 w-full max-w-4xl">
          {/* Soft top glow so the preview reads as floating up from below. */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-16 z-10 h-16 bg-gradient-to-b from-transparent to-off-white/70"
          />
          {/* Negative bottom margin clips the window so it peeks above the fold. */}
          <div className="relative z-0 -mb-28 sm:-mb-32 md:-mb-36">
            <AppPreview />
          </div>
        </div>
      </div>
    </section>
  );
}

function ParallaxBand() {
  return (
    <section className="relative w-full overflow-hidden border-b-2 border-pure-black bg-pure-black">
      <ScrollReveal className="mx-auto max-w-container px-margin pt-16">
        <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-off-white/50">
          One protocol · every primitive
        </p>
        <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold uppercase leading-[1.05] tracking-tight text-off-white md:text-5xl">
          The building blocks for{" "}
          <span className="text-soft-lavender">agentic identity</span>.
        </h2>
      </ScrollReveal>

      {/* Parallax pills (client-only) — bouncy concept pills that drift on hover */}
      <div className="relative w-full">
        <ParallaxPillsClient
          pills={PARALLAX_PILLS}
          height={520}
          width="100%"
          pillHeight={58}
          fontSize={17}
          fontWeight={600}
          parallaxStrength={28}
          className="w-full"
        />
      </div>
    </section>
  );
}

/* Portal moment — "step into the agent economy". WebGL portal behind a CTA. */
function PortalSection() {
  return (
    <section className="relative w-full overflow-hidden border-b-2 border-pure-black bg-pure-black py-28 md:py-40">
      {/* Centered WebGL portal (client-only) behind the headline. */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-[120vmin] w-[120vmin] -translate-x-1/2 -translate-y-1/2"
      >
        <PortalClient
          primaryColor="#6800FF"
          secondaryColor="#9D5CFF"
          centerColor="#CAB1FF"
          speed={1.1}
          density={1.1}
          layerCount={7}
          brightness={1.15}
          scale={1.1}
        />
      </div>

      <RevealGroup
        className="relative z-10 mx-auto max-w-container px-margin text-center"
        stagger={0.12}
        amount={0.4}
      >
        <RevealChild
          as="p"
          className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-soft-lavender"
        >
          Step through
        </RevealChild>
        <RevealChild
          as="h2"
          className="mx-auto mt-4 max-w-3xl font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight text-off-white md:text-6xl"
        >
          A portal into the
          <br />
          <span className="text-soft-lavender">agent economy</span>.
        </RevealChild>
        <RevealChild
          as="p"
          className="mx-auto mt-6 max-w-xl font-mono text-sm leading-relaxed text-off-white/70 md:text-base"
        >
          One name resolves an agent, its skills, and its delegated authority —
          discoverable on-chain, openly yours.
        </RevealChild>
        <RevealChild as="div" className="mt-10 flex justify-center">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 border-2 border-off-white bg-electric-purple px-8 py-4 font-mono text-sm font-bold uppercase text-off-white shadow-[4px_4px_0_0_#CAB1FF] transition-transform neo-hover"
          >
            Enter the economy {icon.arrow}
          </Link>
        </RevealChild>
      </RevealGroup>
    </section>
  );
}

function ClosingCta() {
  return (
    <section className="relative overflow-hidden border-b-2 border-pure-black bg-electric-purple py-24 text-off-white md:py-32">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-20"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, #000 0, #000 1px, transparent 1px, transparent 14px)",
        }}
      />
      <RevealGroup
        className="relative z-10 mx-auto max-w-container px-margin text-center"
        stagger={0.1}
        amount={0.4}
      >
        <RevealChild
          as="h2"
          className="mx-auto max-w-3xl font-display text-4xl font-bold uppercase leading-[0.95] tracking-tight md:text-6xl"
        >
          Give your agent a name
          <br />
          the chain can verify.
        </RevealChild>
        <RevealChild
          as="p"
          className="mx-auto mt-6 max-w-xl font-mono text-base leading-relaxed text-off-white/80"
        >
          Mint an AgentPassport, publish verifiable skills, and delegate scoped
          authority — on Sui, resolvable by SuiNS.
        </RevealChild>
        <RevealChild as="div" className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/create"
            className="inline-flex items-center gap-2 border-2 border-pure-black bg-off-white px-8 py-4 font-mono text-sm font-bold uppercase text-pure-black shadow-[4px_4px_0_0_#000] transition-transform neo-hover"
          >
            Launch App {icon.arrow}
          </Link>
          <Link
            href="/explore"
            className="inline-flex items-center gap-2 border-2 border-off-white px-8 py-4 font-mono text-sm font-bold uppercase text-off-white transition-colors hover:bg-pure-black"
          >
            Explore agents
          </Link>
        </RevealChild>
      </RevealGroup>
    </section>
  );
}

function Footer() {
  return (
    <footer className="relative overflow-hidden border-t-2 border-pure-black bg-[#0A0612] py-16">
      {/* Animated shader background (client-only). Both light/dark backgrounds
          are pinned to the footer's dark tone so it reads correctly even when
          no next-themes provider is mounted (resolvedTheme === undefined).
          Brightness / wave intensity are kept low so the shader stays a quiet
          texture behind the links rather than competing with them. */}
      <div aria-hidden className="pointer-events-none absolute inset-0 z-0 opacity-80">
        <SquircleShiftClient
          width="100%"
          height="100%"
          colorTint="#6800FF"
          lightBackground="#0A0612"
          darkBackground="#0A0612"
          speed={0.18}
          brightness={1.05}
          gridFrequency={22}
          waveIntensity={0.06}
          spiralIntensity={0.7}
          lineThickness={0.05}
        />
      </div>
      {/* Legibility scrim over the shader — stronger toward the bottom where the
          links sit, so the footer nav stays high-contrast. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-t from-[#0A0612] via-[#0A0612]/65 to-[#0A0612]/25"
      />

      <ScrollReveal
        as="div"
        distance={18}
        blur={4}
        className="relative z-10 mx-auto flex max-w-container flex-col items-start justify-between gap-6 px-margin md:flex-row md:items-center"
      >
        <div>
          <Link
            href="/"
            className="font-display text-lg font-bold uppercase tracking-tight text-off-white"
          >
            AgentOS
          </Link>
          <p className="mt-1 font-mono text-xs text-off-white/60">
            Sui-native identity for AI agents.
          </p>
        </div>
        <nav className="flex flex-wrap items-center gap-x-6 gap-y-2 font-mono text-xs font-bold uppercase">
          <Link href="/create" className="text-off-white hover:text-soft-lavender">
            App
          </Link>
          <Link href="/explore" className="text-off-white hover:text-soft-lavender">
            Explore
          </Link>
          <a
            href="https://github.com/Huc06/SuiNS-AgentOS"
            target="_blank"
            rel="noopener noreferrer"
            className="text-off-white hover:text-soft-lavender"
          >
            GitHub
          </a>
          <a
            href="https://github.com/Huc06/SuiNS-AgentOS#readme"
            target="_blank"
            rel="noopener noreferrer"
            className="text-off-white hover:text-soft-lavender"
          >
            Docs
          </a>
        </nav>
      </ScrollReveal>
    </footer>
  );
}

/* ------------------------------------------------------------------ */
/* Composition                                                         */
/* ------------------------------------------------------------------ */

export function AgentOSLanding() {
  return (
    <main className="bg-off-white">
      <ScrollProgress />
      <Hero />
      <ParallaxBand />
      <InlinePillsText />
      <PortalSection />
      <ClosingCta />
      <Footer />
    </main>
  );
}

export default AgentOSLanding;
