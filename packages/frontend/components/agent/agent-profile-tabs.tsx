"use client";

import { useState } from "react";

import type { AgentSkillRow } from "../../lib/agent-types";
import { MemoryPanel } from "./memory-panel";

interface AgentProfileTabsProps {
  skills: AgentSkillRow[];
  agentSlug: string;
}

/**
 * Tab switcher for the agent profile page's "Stack" section — toggles
 * between the existing skills grid ("Stack") and the new Walrus Memory
 * recall panel ("Memory"). Client component so tab state can live outside
 * the (server) page component.
 */
export function AgentProfileTabs({ skills, agentSlug }: AgentProfileTabsProps) {
  const [activeTab, setActiveTab] = useState<"stack" | "memory">("stack");

  return (
    <div>
      <div className="mb-4 flex items-center gap-1 border-b border-pure-black/10">
        {(
          [
            { key: "stack" as const, label: "Stack", count: skills.length },
            { key: "memory" as const, label: "Memory" },
          ]
        ).map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-3 py-2 text-sm font-bold transition-colors ${
              activeTab === tab.key
                ? "border-b-2 border-electric-purple text-electric-purple"
                : "text-black/40 hover:text-black/70"
            }`}
          >
            {tab.label}
            {typeof tab.count === "number" && (
              <span className="inline-flex h-5 w-5 items-center justify-center rounded bg-electric-purple/10 font-mono text-xs font-bold text-electric-purple">
                {tab.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === "stack" &&
        (skills.length === 0 ? (
          <p className="font-mono text-sm text-black/50">
            No skills published yet.
          </p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {skills.map((skill) => (
              <div
                key={skill.id}
                className="flex items-center gap-3 rounded-lg border border-pure-black/10 bg-white px-3 py-3 transition-colors hover:border-electric-purple/30 hover:bg-electric-purple/[0.02]"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-pure-black/10 bg-black/[0.02] text-black/60">
                  {skill.icon === "token" ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v12M6 12h12" />
                    </svg>
                  ) : skill.icon === "wallet" ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <rect x="2" y="6" width="20" height="14" rx="2" />
                      <path d="M22 10H18a2 2 0 000 4h4" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                    >
                      <path d="M16 3l5 5-5 5" />
                      <path d="M21 8H9" />
                      <path d="M8 21l-5-5 5-5" />
                      <path d="M3 16h12" />
                    </svg>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-black">
                    {skill.name}
                  </p>
                  <p className="truncate font-mono text-[12px] text-black/40">
                    {skill.mvrPackage}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ))}

      {activeTab === "memory" && <MemoryPanel agentSlug={agentSlug} />}
    </div>
  );
}
