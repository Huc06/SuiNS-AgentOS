'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { IconChart, IconKey, IconMeta, IconSettings, IconSkills } from './icons';

type AgentManageSidebarProps = {
  agentSlug: string;
};

function navClass(active: boolean) {
  return active
    ? 'flex items-center gap-3 border-2 border-pure-black bg-soft-lavender px-4 py-3 font-mono text-sm font-bold text-pure-black neo-shadow transition-all hover:-translate-x-0.5 hover:-translate-y-0.5'
    : 'group flex items-center gap-3 px-4 py-3 font-mono text-sm font-bold text-on-surface-variant transition-all hover:bg-surface-container hover:text-pure-black';
}

export function AgentManageSidebar({ agentSlug }: AgentManageSidebarProps) {
  const pathname = usePathname();
  const base = `/agent/${agentSlug}`;

  const isManage = pathname === base || pathname === `${base}/`;
  const isAnalytics = pathname.startsWith(`${base}/skills`);
  const isDelegate = pathname.startsWith(`${base}/delegate`);

  return (
    <aside className="hidden w-52 shrink-0 border-r-2 border-pure-black py-8 pr-6 xl:w-64 xl:py-12 xl:pr-8 lg:block">
      <div className="space-y-1">
        <div className="mb-4 px-2 font-mono text-sm font-bold uppercase text-pure-black/40">
          Management
        </div>
        <Link href={base} className={navClass(isManage)}>
          <IconSkills className="h-5 w-5" />
          My Skills
        </Link>
        <Link href={`${base}/skills`} className={navClass(isAnalytics)}>
          <IconChart className="h-5 w-5" />
          Analytics
        </Link>
        <span className={navClass(false)}>
          <IconMeta className="h-5 w-5" />
          Metadata
        </span>
      </div>

      <div className="mt-12 space-y-1">
        <div className="mb-4 px-2 font-mono text-sm font-bold uppercase text-pure-black/40">
          Settings
        </div>
        <span className={navClass(false)}>
          <IconKey className="h-5 w-5" />
          API Keys
        </span>
        <Link href={`${base}/delegate`} className={navClass(isDelegate)}>
          <IconSettings className="h-5 w-5" />
          Delegation
        </Link>
      </div>
    </aside>
  );
}
