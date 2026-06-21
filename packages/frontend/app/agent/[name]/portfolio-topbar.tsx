"use client";

import Link from "next/link";
import { useState } from "react";

export function PortfolioTopbar({ slug }: { slug: string }) {
  const [expanded, setExpanded] = useState(false);

  const toggle = () => {
    setExpanded(!expanded);
    // Hide/show sidebar + remove margin
    const sidebar = document.querySelector("aside");
    const content = document.getElementById("main-content");
    if (sidebar) sidebar.style.display = expanded ? "" : "none";
    if (content) content.style.marginLeft = expanded ? "" : "0";
  };

  return (
    <nav className="mb-4 flex items-center justify-between">
      <div className="flex items-center gap-1.5 font-mono text-xs text-black/50">
        <Link href="/explore" className="hover:text-black">
          Portfolio
        </Link>
        <span className="text-black/30">/</span>
        <span className="font-bold text-black">@{slug}</span>
      </div>
      <button
        type="button"
        onClick={toggle}
        className="flex h-7 w-7 items-center justify-center rounded border border-pure-black/10 text-black/40 transition-colors hover:border-electric-purple hover:text-electric-purple"
        title={expanded ? "Exit fullscreen" : "Expand fullscreen"}
      >
        {expanded ? (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 14h6v6" />
            <path d="M20 10h-6V4" />
            <path d="M14 10l7-7" />
            <path d="M3 21l7-7" />
          </svg>
        ) : (
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M15 3h6v6" />
            <path d="M9 21H3v-6" />
            <path d="M21 3l-7 7" />
            <path d="M3 21l7-7" />
          </svg>
        )}
      </button>
    </nav>
  );
}
