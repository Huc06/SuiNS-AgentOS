import Link from 'next/link';

export default function RootNotFound() {
  return (
    <main className="mx-auto max-w-container px-margin py-32 text-center">
      <h1 className="font-display text-5xl font-black text-pure-black">404</h1>
      <p className="mt-4 font-mono text-lg text-on-surface-variant">
        Page not found
      </p>
      <p className="mt-2 font-mono text-sm text-on-surface-variant">
        The page you are looking for does not exist or has been moved.
      </p>
      <Link
        href="/"
        className="mt-8 inline-block border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000]"
      >
        Back to Explorer
      </Link>
    </main>
  );
}
