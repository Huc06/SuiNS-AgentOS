"use client";

import Link from "next/link";
import { useState } from "react";

import { EditPanel } from "./edit-panel";

interface ActionBarProps {
  agentSlug: string;
  name: string;
  explorerUrl: string;
  description: string;
}

export function ActionBar({
  agentSlug,
  name,
  explorerUrl,
  description,
}: ActionBarProps) {
  const [editOpen, setEditOpen] = useState(false);

  return (
    <>
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
          onClick={() => setEditOpen(true)}
          className="rounded border border-electric-purple/30 bg-electric-purple/5 px-3 py-1.5 font-mono text-[11px] font-bold text-electric-purple transition-all hover:bg-electric-purple/10"
        >
          Edit Portfolio
        </button>
      </div>

      <EditPanel
        open={editOpen}
        onClose={() => setEditOpen(false)}
        agentSlug={agentSlug}
        initialDescription={description}
      />
    </>
  );
}
