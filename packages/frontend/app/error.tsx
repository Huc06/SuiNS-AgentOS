'use client';

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="mx-auto max-w-container px-margin py-32">
      <div className="border-2 border-error bg-red-50 p-8 neo-shadow">
        <h1 className="font-display text-2xl font-bold text-error">Something went wrong</h1>
        <p className="mt-3 font-mono text-sm text-on-surface-variant">
          {error.message || 'An unexpected error occurred.'}
        </p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 border-2 border-pure-black bg-electric-purple px-6 py-3 font-mono text-sm font-bold text-off-white neo-shadow transition-all hover:-translate-x-1 hover:-translate-y-1 hover:shadow-[8px_8px_0_0_#000]"
        >
          Try again
        </button>
      </div>
    </main>
  );
}
