"use client";

import Link from "next/link";
import { useState } from "react";

import type { AgentSkillRow } from "../../../lib/agent-types";
import { EditPanel } from "./edit-panel";

interface ActionBarProps {
  agentSlug: string;
  name: string;
  explorerUrl: string;
  description: string;
  skills: AgentSkillRow[];
}

export function ActionBar({
  agentSlug,
  name,
  explorerUrl,
  description,
  skills,
}: ActionBarProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
      {/* Center content between sidebar and edit panel */}
      <style>
        {editOpen
          ? `main[data-portfolio] { margin-right: 320px; max-width: none; transition: margin-right 0.2s ease; }`
          : `main[data-portfolio] { margin-right: auto; max-width: 48rem; transition: margin-right 0.2s ease; }`}
      </style>

      <div className="flex flex-wrap items-center gap-2 border-t border-pure-black/10 px-6 py-4">
        <a
          href={explorerUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded border border-pure-black/10 px-3 py-1.5 font-mono text-[11px] font-bold text-black/60 transition-all hover:border-electric-purple hover:text-electric-purple"
        >
          Suiscan ↗
        </a>
        <Link
          href={`/agent/${name}/skills`}
          className="rounded border border-pure-black/10 px-3 py-1.5 font-mono text-[11px] font-bold text-black/60 transition-all hover:border-electric-purple hover:text-electric-purple"
        >
          Skills
        </Link>
        <Link
          href={`/agent/${name}/delegate`}
          className="rounded border border-pure-black/10 px-3 py-1.5 font-mono text-[11px] font-bold text-black/60 transition-all hover:border-electric-purple hover:text-electric-purple"
        >
          Delegate
        </Link>
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => setEditOpen(!editOpen)}
          className={`rounded border px-3 py-1.5 font-mono text-[11px] font-bold transition-all ${
            editOpen
              ? "border-electric-purple bg-electric-purple text-white"
              : "border-electric-purple/30 bg-electric-purple/5 text-electric-purple hover:bg-electric-purple/10"
          }`}
        >
          {editOpen ? "Close Editor" : "Edit Portfolio"}
        </button>
      </div>

      <EditPanel
        open={editOpen}
        onClose={() => setEditOpen(false)}
        agentSlug={agentSlug}
        initialDescription={description}
        skills={skills}
      />
    </>
  );
}
