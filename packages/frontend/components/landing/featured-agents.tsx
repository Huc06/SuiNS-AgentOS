import Link from 'next/link';

const FEATURED = [
  { slug: 'alpha', label: '@alpha', network: 'mainnet' },
  { slug: 'beta-agent', label: '@beta-agent', network: 'testnet' },
  { slug: 'walrus-bot', label: '@walrus-bot', network: 'mainnet' },
] as const;

export function FeaturedAgents() {
  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      <span className="font-mono text-xs font-bold uppercase text-on-surface-variant">
        Try:
      </span>
      {FEATURED.map((a) => (
        <Link
          key={a.slug}
          href={`/agent/${a.slug}`}
          className="border-2 border-pure-black bg-white px-3 py-1 font-mono text-xs font-bold transition-colors hover:bg-soft-lavender"
        >
          {a.label}
          <span className="ml-1 text-on-surface-variant">({a.network})</span>
        </Link>
      ))}
    </div>
  );
}
