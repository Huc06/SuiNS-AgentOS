'use client';

import { useState } from 'react';

import type { AgentSkillRow } from '../../lib/mock-agents';
import { IconCopy, IconEdit, IconPublish, IconSwap, IconToken, IconWallet } from './icons';

const iconMap = {
  token: IconToken,
  wallet: IconWallet,
  swap: IconSwap,
};

const iconBg = {
  token: 'bg-soft-lavender',
  wallet: 'bg-surface-dim',
  swap: 'bg-vibrant-blue text-off-white',
};

export function SkillListItem({ skill }: { skill: AgentSkillRow }) {
  const [copied, setCopied] = useState(false);
  const Icon = iconMap[skill.icon];
  const active = skill.status === 'active';

  const copyId = async () => {
    try {
      await navigator.clipboard.writeText(skill.objectId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  return (
    <article className="max-w-full overflow-hidden border-2 border-pure-black bg-white p-4 sm:p-6 neo-shadow">
      {/* Row 1: identity — matches MVR flex-col → md:row */}
      <div className="flex flex-col gap-4 min-[900px]:flex-row min-[900px]:items-start min-[900px]:justify-between">
        <div className="flex min-w-0 items-start gap-3 sm:gap-4 min-[900px]:max-w-[calc(100%-15rem)] min-[900px]:flex-1">
          <div
            className={`flex h-14 w-14 shrink-0 items-center justify-center border-2 border-pure-black sm:h-16 sm:w-16 ${iconBg[skill.icon]} ${skill.icon === 'wallet' ? 'opacity-70' : ''}`}
          >
            <Icon className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>

          <div className="min-w-0 flex-1 overflow-hidden">
            <h3 className="font-display text-lg font-semibold leading-tight break-words sm:text-xl">
              {skill.name}
            </h3>
            <p className="mt-0.5 font-mono text-xs leading-snug break-all text-on-surface-variant sm:text-sm">
              {skill.mvrPackage}
            </p>

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex shrink-0 px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                  skill.network === 'mainnet'
                    ? 'bg-pure-black text-off-white'
                    : 'bg-on-surface-variant text-off-white'
                }`}
              >
                {skill.network}
              </span>
              <span className="inline-flex shrink-0 border border-pure-black px-2 py-0.5 font-mono text-[10px] font-bold uppercase">
                {skill.version}
              </span>
            </div>

            <div className="mt-2 flex min-w-0 items-center gap-2 font-mono text-xs text-on-surface-variant sm:text-sm">
              <span className="min-w-0 truncate">{skill.objectId}</span>
              <button
                type="button"
                onClick={copyId}
                className="shrink-0 p-0.5 text-on-surface-variant transition-colors hover:text-electric-purple"
                aria-label="Copy object ID"
              >
                <IconCopy />
              </button>
              {copied && <span className="shrink-0 text-xs text-green-800">Copied</span>}
            </div>
          </div>
        </div>

        {/* Actions — full width until wide; then fixed column on the right */}
        <div className="grid w-full min-w-0 grid-cols-1 gap-2 sm:grid-cols-2 min-[900px]:w-56 min-[900px]:shrink-0 min-[900px]:grid-cols-1">
          <button
            type="button"
            className="flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 border-2 border-pure-black px-3 py-2 font-mono text-xs font-bold sm:text-sm transition-colors hover:bg-surface-container"
          >
            <IconEdit className="h-4 w-4 shrink-0" />
            <span className="truncate">Edit Metadata</span>
          </button>
          <button
            type="button"
            className="flex min-h-[44px] w-full min-w-0 items-center justify-center gap-2 border-2 border-pure-black bg-electric-purple px-3 py-2 font-mono text-xs font-bold text-off-white sm:text-sm transition-colors hover:bg-pure-black"
          >
            <IconPublish className="h-4 w-4 shrink-0" />
            <span className="truncate">New Version</span>
          </button>
        </div>
      </div>

      {/* Row 2: stats */}
      <div className="mt-4 grid grid-cols-1 gap-3 border-t border-pure-black/10 pt-4 min-[480px]:grid-cols-2 xl:grid-cols-4 sm:mt-6 sm:pt-6">
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-xs font-bold text-pure-black/40 sm:text-sm">STATUS</span>
          {active ? (
            <span className="flex items-center gap-1.5 font-mono text-xs font-bold text-green-600 sm:text-sm">
              <span className="h-2 w-2 shrink-0 rounded-full bg-green-600" />
              ACTIVE
            </span>
          ) : (
            <span className="font-mono text-xs font-bold text-on-surface-variant sm:text-sm">ARCHIVED</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className="shrink-0 font-mono text-xs font-bold text-pure-black/40 sm:text-sm">RESOLUTIONS</span>
          <span className="font-mono text-xs font-bold sm:text-sm">{skill.resolutions}</span>
        </div>
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-mono text-xs font-bold text-pure-black/40 sm:text-sm">LAST UPDATED</span>
          <span className="truncate font-mono text-xs font-bold sm:text-sm">{skill.lastUpdated}</span>
        </div>
        <div className="flex items-center min-[480px]:justify-end xl:justify-end">
          <button
            type="button"
            className={`font-mono text-xs font-bold decoration-2 underline-offset-4 hover:underline sm:text-sm ${
              active ? 'text-electric-purple' : 'text-on-surface-variant'
            }`}
          >
            {active ? 'View Analytics →' : 'View Records →'}
          </button>
        </div>
      </div>
    </article>
  );
}
