"use client";

import { useCallback, useEffect, useState } from "react";

interface MemoryEntry {
  text?: string;
  score?: number;
  [key: string]: unknown;
}

interface RecallResponse {
  memories: unknown[];
  configured: boolean;
  error?: string;
}

interface MemoryPanelProps {
  agentSlug: string;
}

export function MemoryPanel({ agentSlug }: MemoryPanelProps) {
  const [query, setQuery] = useState("agent activity execution");
  const [memories, setMemories] = useState<MemoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const recall = useCallback(
    async (q: string) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/memory/recall?agent=${encodeURIComponent(agentSlug)}&query=${encodeURIComponent(q)}&limit=10`,
          { cache: "no-store" },
        );
        const data = (await res.json()) as RecallResponse;
        setConfigured(data.configured);
        setMemories(
          (data.memories ?? []).map((m) =>
            typeof m === "object" && m !== null ? (m as MemoryEntry) : { text: String(m) },
          ),
        );
        if (data.error) setError(data.error);
      } catch {
        setError("Could not load memories");
      } finally {
        setLoading(false);
      }
    },
    [agentSlug],
  );

  useEffect(() => {
    void recall(query);
  }, [recall, query]);

  // Debounce query input
  const [inputValue, setInputValue] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setQuery(inputValue), 400);
    return () => clearTimeout(timer);
  }, [inputValue]);

  if (!configured) {
    return (
      <div className="border-2 border-dashed border-pure-black p-6 font-mono text-sm">
        <p className="font-bold">Walrus Memory not configured.</p>
        <p className="mt-1 text-on-surface-variant">
          Set <code>MEMWAL_ACCOUNT_ID</code> and <code>MEMWAL_DELEGATE_KEY</code> in your
          environment to enable semantic agent memory on Walrus.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <input
          type="search"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder="Search memories..."
          className="w-full border-2 border-pure-black bg-white px-3 py-2 font-mono text-sm outline-none focus:ring-2 focus:ring-electric-purple"
        />
      </div>

      {loading && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-12 animate-pulse border-2 border-pure-black bg-surface-dim" />
          ))}
        </div>
      )}

      {!loading && error && (
        <div className="border-2 border-pure-black p-4 font-mono text-sm text-red-700">
          {error}{" "}
          <button
            type="button"
            onClick={() => void recall(query)}
            className="underline"
          >
            Retry
          </button>
        </div>
      )}

      {!loading && !error && memories.length === 0 && (
        <p className="border-2 border-dashed border-pure-black py-8 text-center font-mono text-sm text-on-surface-variant">
          No memories yet. Run a skill to write the first entry.
        </p>
      )}

      {!loading && memories.map((entry, idx) => {
        const text = entry.text ?? JSON.stringify(entry);
        const tsMatch = text.match(/\d{4}-\d{2}-\d{2}T[\d:.Z]+/);
        const ts = tsMatch ? new Date(tsMatch[0]).toLocaleString() : null;
        const preview = text.length > 120 ? text.slice(0, 120) + "…" : text;
        return (
          <div
            key={idx}
            className="border-2 border-pure-black bg-white p-3 font-mono text-sm neo-shadow"
          >
            {ts && (
              <p className="mb-1 text-xs text-on-surface-variant">{ts}</p>
            )}
            <p className="leading-relaxed">{preview}</p>
          </div>
        );
      })}
    </div>
  );
}
