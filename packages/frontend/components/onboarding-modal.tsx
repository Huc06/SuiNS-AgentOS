"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const STORAGE_KEY = "agentos-onboarded-v1";

const FEATURES = [
  {
    title: "Agent Passports",
    desc: "Mint a SuiNS (.sui) identity for your agent. It's a discoverable, verifiable on-chain passport you own, with its own runtime wallet.",
  },
  {
    title: "Skill Registry",
    desc: "Publish skills to Walrus and resolve them on-chain by SuiNS name. Agents discover and compose capabilities from a shared registry.",
  },
  {
    title: "Scoped Delegation",
    desc: "Grant sub-agents specific capabilities with spend limits and expiry. Agents coordinate agents, and you can revoke access any time.",
  },
  {
    title: "Build & Run",
    desc: "Compose visual workflows on the canvas, or integrate via the CLI and MCP (Cursor, Claude Code). Run them on Sui testnet.",
  },
];

export function OnboardingModal() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<1 | 2>(1);

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) {
        setOpen(true);
      }
    } catch {
      /* localStorage unavailable */
    }
  }, []);

  const dismiss = () => {
    try {
      localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };

  const go = (href: string) => {
    dismiss();
    router.push(href);
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="onboarding-title"
    >
      <div className="relative w-full max-w-2xl border-2 border-pure-black bg-off-white p-6 shadow-[6px_6px_0_0_#000]">
        <button
          type="button"
          onClick={dismiss}
          className="absolute right-4 top-4 text-black/40 transition-colors hover:text-black"
          aria-label="Close"
        >
          ✕
        </button>

        {step === 1 ? (
          <>
            <h2
              id="onboarding-title"
              className="font-display text-2xl font-bold text-black"
            >
              Welcome to SuiNS AgentOS
            </h2>
            <p className="mt-1 font-mono text-sm text-black/60">
              Identity, skills, and delegation for AI agents on Sui.
            </p>

            <div className="my-5 border-2 border-pure-black bg-soft-lavender/40 p-1">
              <div className="divide-y-2 divide-pure-black/10">
                {FEATURES.map((f) => (
                  <div key={f.title} className="px-5 py-3">
                    <h3 className="text-sm font-bold text-black">{f.title}</h3>
                    <p className="mt-1 font-mono text-xs leading-relaxed text-black/70">
                      {f.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] text-black/40">
                Step 1 of 2
              </span>
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={dismiss}
                  className="border-2 border-pure-black bg-white px-4 py-2 font-mono text-xs font-bold text-black transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000]"
                >
                  Skip Tour
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="border-2 border-pure-black bg-electric-purple px-4 py-2 font-mono text-xs font-bold text-white transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000]"
                >
                  Next →
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="mb-5 flex items-center gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="flex h-7 w-7 items-center justify-center border-2 border-pure-black bg-white text-black transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#000]"
                aria-label="Back"
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 18l-6-6 6-6" />
                </svg>
              </button>
              <h2 className="font-display text-xl font-bold text-black">
                How would you like to start?
              </h2>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <StartCard
                title="Create an Agent"
                action="New Passport"
                variant="agent"
                onClick={() => go("/explore")}
              />
              <StartCard
                title="Build a Workflow"
                action="Open Canvas"
                variant="workflow"
                onClick={() => go("/create")}
              />
              <StartCard
                title="Explore Agents"
                action="Browse Now"
                variant="browse"
                onClick={() => go("/explore")}
              />
            </div>

            <p className="mt-5 font-mono text-[10px] text-black/40">
              Step 2 of 2
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function StartCard({
  title,
  action,
  variant,
  onClick,
}: {
  title: string;
  action: string;
  variant: "agent" | "workflow" | "browse";
  onClick: () => void;
}) {
  const icon =
    variant === "agent" ? (
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1.5"
      >
        <circle cx="12" cy="8" r="4" />
        <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
      </svg>
    ) : variant === "workflow" ? (
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1.5"
      >
        <circle cx="5" cy="6" r="2.5" />
        <circle cx="5" cy="18" r="2.5" />
        <circle cx="19" cy="12" r="2.5" />
        <path d="M7.3 7l9.4 4M7.3 17l9.4-4" />
      </svg>
    ) : (
      <svg
        width="36"
        height="36"
        viewBox="0 0 24 24"
        fill="none"
        stroke="#3B82F6"
        strokeWidth="1.5"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="M21 21l-4.3-4.3" />
      </svg>
    );

  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col items-center border-2 border-pure-black bg-soft-lavender/30 p-5 text-center shadow-[4px_4px_0_0_#000] transition-all hover:-translate-y-0.5 hover:shadow-[6px_6px_0_0_#000]"
    >
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-lg bg-white">
        {icon}
      </div>
      <p className="mb-4 text-sm font-bold text-black">{title}</p>
      <span className="flex w-full items-center justify-between rounded border-2 border-pure-black bg-electric-purple/15 px-3 py-2 font-mono text-[11px] font-bold text-black">
        {action}
        <span aria-hidden>→</span>
      </span>
    </button>
  );
}
