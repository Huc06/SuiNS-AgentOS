"use client";

export function CopyButton({ text }: { text: string }) {
  return (
    <button
      type="button"
      onClick={() => navigator?.clipboard?.writeText(text)}
      className="rounded border border-pure-black/10 px-2 py-0.5 font-mono text-[10px] font-bold text-black/50 transition-colors hover:bg-black/5 hover:text-black"
      aria-label={`Copy ${text}`}
    >
      Copy
    </button>
  );
}
