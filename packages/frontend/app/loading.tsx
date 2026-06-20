import { SkeletonCard } from '../components/ui/skeleton';

export default function RootLoading() {
  return (
    <main className="mx-auto max-w-container px-margin py-32">
      <div className="mb-8 h-8 w-48 animate-pulse border-2 border-pure-black bg-surface-container motion-reduce:animate-none" />
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
    </main>
  );
}
