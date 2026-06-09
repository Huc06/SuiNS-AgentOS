import Link from 'next/link';

import { SiteFooter } from '../site-footer';
import { SiteHeader } from '../site-header';

export function AgentNotFound({ name }: { name: string }) {
  return (
    <>
      <SiteHeader activeHref="/create" />
      <main className="mx-auto max-w-container px-margin py-32">
        <h1 className="font-display text-3xl font-bold">Agent not found</h1>
        <p className="mt-4 font-mono text-on-surface-variant">
          No passport for <strong>{name}</strong> in the workspace registry.
        </p>
        <Link
          href="/create"
          className="mt-8 inline-block border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow"
        >
          Back to Dashboard
        </Link>
      </main>
      <SiteFooter />
    </>
  );
}
