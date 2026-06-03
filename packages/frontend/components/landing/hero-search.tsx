'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useState } from 'react';

function SearchIcon() {
  return (
    <svg
      width={28}
      height={28}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="shrink-0 text-pure-black"
      aria-hidden
    >
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth={2.5} />
      <path
        d="M16.5 16.5L21 21"
        stroke="currentColor"
        strokeWidth={2.5}
        strokeLinecap="square"
      />
    </svg>
  );
}

function normalizeAgentName(input: string): string {
  const trimmed = input.trim().toLowerCase();
  if (!trimmed) return '';
  return trimmed.endsWith('.sui') ? trimmed.slice(0, -4) : trimmed;
}

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const name = normalizeAgentName(query);
    if (name) router.push(`/agent/${encodeURIComponent(name)}`);
  }

  return (
    <div className="max-w-3xl">
      <form onSubmit={onSubmit} className="relative">
        <div
          className="pointer-events-none absolute inset-0 translate-x-2 translate-y-2 bg-pure-black"
          aria-hidden
        />
        <div className="relative flex overflow-hidden border-2 border-pure-black bg-white">
          <div className="flex shrink-0 items-center justify-center border-r-2 border-pure-black bg-surface-container px-5 py-5">
            <SearchIcon />
          </div>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="min-w-0 flex-grow border-none px-6 py-5 font-mono text-base font-bold placeholder:text-surface-dim focus:ring-0"
            placeholder="Search by SuiNS name (e.g. alpha, research-bot)..."
            type="text"
            name="agent"
            autoComplete="off"
          />
          <button
            type="submit"
            className="shrink-0 border-l-2 border-pure-black bg-electric-purple px-8 py-5 font-display text-lg font-bold uppercase text-off-white transition-colors hover:bg-pure-black"
          >
            Resolve
          </button>
        </div>
      </form>

      <p className="mt-4 font-mono text-sm text-on-surface-variant">
        Or{' '}
        <Link
          href="/create"
          className="font-bold text-electric-purple underline-offset-2 hover:underline"
        >
          create a new agent
        </Link>{' '}
        — connect wallet, mint passport, bind SuiNS (coming soon).
      </p>
    </div>
  );
}
