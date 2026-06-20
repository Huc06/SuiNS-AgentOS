"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";

import type { AgentCardData } from "../dashboard/agent-card";

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

function normalizeAgentQuery(input: string): string {
  const trimmed = input.trim().toLowerCase().replace(/^@/, "");
  if (!trimmed) return "";
  return trimmed.endsWith(".sui") ? trimmed.slice(0, -4) : trimmed;
}

const networkBadge: Record<string, string> = {
  mainnet: "bg-green-100 text-green-800 border-green-800",
  testnet: "bg-blue-100 text-blue-800 border-blue-800",
};

export function HeroSearch() {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  // Autocomplete state
  const [suggestions, setSuggestions] = useState<AgentCardData[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = "hero-search-listbox";

  // Fetch suggestions with debounce
  const fetchSuggestions = useCallback((q: string) => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(q.trim())}`,
          {
            cache: "no-store",
          },
        );
        const data = (await res.json()) as { results?: AgentCardData[] };
        const results = data.results ?? [];
        setSuggestions(results);
        setShowDropdown(results.length > 0);
        setActiveIndex(-1);
      } catch {
        setSuggestions([]);
        setShowDropdown(false);
      }
    }, 150);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function navigateToAgent(slug: string) {
    setShowDropdown(false);
    setQuery("");
    router.push(`/agent/${encodeURIComponent(slug)}`);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (!showDropdown) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      navigateToAgent(suggestions[activeIndex].slug);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
      setActiveIndex(-1);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();

    // If an item is highlighted, navigate to it
    if (activeIndex >= 0 && suggestions[activeIndex]) {
      navigateToAgent(suggestions[activeIndex].slug);
      return;
    }

    const slug = normalizeAgentQuery(query);
    if (!slug) return;

    setResolving(true);
    setError(null);
    setShowDropdown(false);
    try {
      const res = await fetch(`/api/resolve?name=${encodeURIComponent(slug)}`, {
        cache: "no-store",
      });
      if (!res.ok) {
        setError(
          `No agent found for "${slug}". Create one from the dashboard.`,
        );
        return;
      }
      const data = (await res.json()) as { agent: { slug: string } };
      router.push(`/agent/${encodeURIComponent(data.agent.slug)}`);
    } catch {
      setError("Could not resolve agent. Try again.");
    } finally {
      setResolving(false);
    }
  }

  return (
    <div className="max-w-3xl" ref={containerRef}>
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
            onChange={(e) => {
              setQuery(e.target.value);
              if (error) setError(null);
              fetchSuggestions(e.target.value);
            }}
            onFocus={() => {
              if (suggestions.length > 0) setShowDropdown(true);
            }}
            onKeyDown={onKeyDown}
            className="min-w-0 flex-grow border-none px-6 py-5 font-mono text-base font-bold placeholder:text-surface-dim focus:outline-none focus:ring-0"
            placeholder="Search by SuiNS name (e.g. alpha, research-bot)..."
            type="text"
            name="agent"
            autoComplete="off"
            role="combobox"
            aria-expanded={showDropdown}
            aria-controls={listboxId}
            aria-activedescendant={
              activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined
            }
          />
          <button
            type="submit"
            disabled={resolving}
            className="shrink-0 border-l-2 border-pure-black bg-electric-purple px-8 py-5 font-display text-lg font-bold uppercase text-off-white transition-colors hover:bg-pure-black disabled:opacity-60"
          >
            {resolving ? "…" : "Find"}
          </button>
        </div>

        {/* Autocomplete dropdown */}
        {showDropdown && (
          <ul
            id={listboxId}
            role="listbox"
            className="absolute left-0 right-0 top-full z-50 mt-1 border-2 border-pure-black bg-white neo-shadow"
          >
            {suggestions.map((agent, i) => (
              <li
                key={agent.slug}
                id={`suggestion-${i}`}
                role="option"
                aria-selected={i === activeIndex}
                onMouseEnter={() => setActiveIndex(i)}
                onClick={() => navigateToAgent(agent.slug)}
                className={`flex cursor-pointer items-center justify-between px-5 py-3 font-mono text-sm transition-colors ${
                  i === activeIndex
                    ? "bg-soft-lavender text-pure-black"
                    : "text-on-surface hover:bg-surface-container"
                }`}
              >
                <span className="font-bold">{agent.displayName}</span>
                <span
                  className={`border px-2 py-0.5 text-[10px] font-bold uppercase ${
                    networkBadge[agent.network] ?? "border-pure-black"
                  }`}
                >
                  {agent.network}
                </span>
              </li>
            ))}
          </ul>
        )}
      </form>

      {error && (
        <p className="mt-3 font-mono text-sm font-bold text-error" role="alert">
          {error}
        </p>
      )}

      {/* "No agents match" row when typing produces zero results */}
      {query.trim() &&
        !showDropdown &&
        suggestions.length === 0 &&
        !resolving &&
        !error && (
          <p className="mt-3 font-mono text-sm text-on-surface-variant">
            No agents match &ldquo;{query.trim()}&rdquo; —{" "}
            <Link
              href="/create"
              className="font-bold text-electric-purple hover:underline"
            >
              create &ldquo;{normalizeAgentQuery(query)}&rdquo;
            </Link>
          </p>
        )}

      <p className="mt-4 font-mono text-sm text-on-surface-variant">
        Or{" "}
        <Link
          href="/create"
          className="font-bold text-electric-purple underline-offset-2 hover:underline"
        >
          create a new agent
        </Link>{" "}
        — register in workspace, mint on-chain when contracts are live.
      </p>
    </div>
  );
}
