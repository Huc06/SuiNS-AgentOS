import Link from 'next/link';

export default function AgentNotFoundPage() {
  return (
    <main className="mx-auto max-w-container px-margin py-32 text-center">
      <div className="border-2 border-dashed border-pure-black bg-white px-8 py-12 neo-shadow">
        <h1 className="font-display text-3xl font-bold text-on-surface">Agent not found</h1>
        <p className="mt-4 font-mono text-sm text-on-surface-variant">
          No agent with this <code className="bg-surface-container px-1">.sui</code> name exists in the registry.
        </p>
        <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Link
            href="/create"
            className="border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000]"
          >
            Create an Agent
          </Link>
          <Link
            href="/"
            className="border-2 border-pure-black bg-white px-6 py-3 font-mono text-sm font-bold text-on-surface neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000]"
          >
            Explore Agents
          </Link>
        </div>
      </div>
    </main>
  );
}
