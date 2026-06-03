import Link from 'next/link';

export function Cta() {
  return (
    <section className="bg-electric-purple py-20 text-off-white">
      <div className="mx-auto max-w-container px-margin text-center">
        <h2 className="font-display text-4xl font-bold uppercase md:text-5xl">
          Ship your first agent
        </h2>
        <p className="mx-auto mt-6 max-w-xl font-mono text-base">
          Scaffold is live — contracts, SDK, CLI, and explorer UI. Connect a wallet and register an
          agent passport on testnet.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Link
            href="/create"
            className="inline-block border-2 border-pure-black bg-off-white px-8 py-4 font-mono text-sm font-bold uppercase text-pure-black neo-shadow transition-transform neo-hover"
          >
            Create Agent
          </Link>
          <a
            href="https://github.com/Huc06/SuiNS-AgentOS"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block border-2 border-off-white px-8 py-4 font-mono text-sm font-bold uppercase transition-colors hover:bg-pure-black"
          >
            View on GitHub
          </a>
        </div>
      </div>
    </section>
  );
}
