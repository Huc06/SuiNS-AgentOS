import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="border-t-2 border-pure-black bg-off-white py-12">
      <div className="mx-auto flex max-w-container flex-col gap-8 px-margin md:flex-row md:items-center md:justify-between">
        <div>
          <div className="font-display text-lg font-black uppercase tracking-tighter">
            SuiNS AgentOS
          </div>
          <p className="mt-2 font-mono text-xs text-on-surface-variant">
            Identity · Skills · Delegation on Sui
          </p>
        </div>
        <nav className="flex flex-wrap gap-6 font-mono text-sm font-bold">
          <Link href="/" className="hover:text-electric-purple">
            Explore
          </Link>
          <Link href="/create" className="hover:text-electric-purple">
            Create
          </Link>
          <a
            href="https://github.com/Huc06/SuiNS-AgentOS/issues"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-electric-purple"
          >
            Roadmap
          </a>
        </nav>
      </div>
    </footer>
  );
}
