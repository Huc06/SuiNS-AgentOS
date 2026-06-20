"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

import {
  IconChart,
  IconKey,
  IconMeta,
  IconSettings,
  IconSkills,
} from "./icons";

type AgentManageSidebarProps = {
  agentSlug: string;
};

function navClass(active: boolean) {
  return active
    ? "flex items-center gap-3 border-2 border-pure-black bg-soft-lavender px-4 py-3 font-mono text-sm font-bold text-pure-black neo-shadow transition-all hover:-translate-x-0.5 hover:-translate-y-0.5"
    : "group flex items-center gap-3 px-4 py-3 font-mono text-sm font-bold text-on-surface-variant transition-all hover:bg-surface-container hover:text-pure-black";
}

export function AgentManageSidebar({ agentSlug }: AgentManageSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const base = `/agent/${agentSlug}`;

  const isManage = pathname === base || pathname === `${base}/`;
  const isAnalytics = pathname.startsWith(`${base}/skills`);
  const isDelegate = pathname.startsWith(`${base}/delegate`);

  const currentLabel = isDelegate
    ? "Delegation"
    : isAnalytics
      ? "Analytics"
      : "My Skills";

  const navContent = (
    <>
      <div className="space-y-1">
        <div className="mb-4 px-2 font-mono text-sm font-bold uppercase text-pure-black/40">
          Management
        </div>
        <Link
          href={base}
          className={navClass(isManage)}
          onClick={() => setMobileOpen(false)}
        >
          <IconSkills className="h-5 w-5" />
          My Skills
        </Link>
        <Link
          href={`${base}/skills`}
          className={navClass(isAnalytics)}
          onClick={() => setMobileOpen(false)}
        >
          <IconChart className="h-5 w-5" />
          Analytics
        </Link>
        <span className={navClass(false)}>
          <IconMeta className="h-5 w-5" />
          Metadata
        </span>
      </div>

      <div className="mt-12 space-y-1 lg:mt-12">
        <div className="mb-4 px-2 font-mono text-sm font-bold uppercase text-pure-black/40">
          Settings
        </div>
        <span className={navClass(false)}>
          <IconKey className="h-5 w-5" />
          API Keys
        </span>
        <Link
          href={`${base}/delegate`}
          className={navClass(isDelegate)}
          onClick={() => setMobileOpen(false)}
        >
          <IconSettings className="h-5 w-5" />
          Delegation
        </Link>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop sidebar — hidden on mobile */}
      <aside className="hidden w-52 shrink-0 border-r-2 border-pure-black py-8 pr-6 xl:w-64 xl:py-12 xl:pr-8 lg:block">
        {navContent}
      </aside>

      {/* Mobile collapsible nav — visible only below lg */}
      <div className="w-full border-b-2 border-pure-black lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen(!mobileOpen)}
          className="flex min-h-[44px] w-full items-center justify-between px-4 py-3 font-mono text-sm font-bold"
          aria-expanded={mobileOpen}
          aria-label="Toggle management navigation"
        >
          <span className="text-electric-purple">{currentLabel}</span>
          <span className="text-on-surface-variant">
            {mobileOpen ? "▲" : "▼"}
          </span>
        </button>
        {mobileOpen && (
          <div className="border-t-2 border-pure-black bg-white px-4 py-4">
            {navContent}
          </div>
        )}
      </div>
    </>
  );
}
