import { Suspense } from "react";

import { CreateDashboard } from "../../components/dashboard/create-dashboard";
import { SkeletonCard } from "../../components/ui/skeleton";
import { SiteFooter } from "../../components/site-footer";
import { SiteHeader } from "../../components/site-header";

export default function CreatePage() {
  return (
    <>
      <SiteHeader activeHref="/create" />
      <main className="mx-auto max-w-container px-margin pb-24 pt-32">
        <Suspense
          fallback={
            <div className="space-y-8">
              <div className="h-8 w-48 animate-pulse border-2 border-pure-black bg-surface-container motion-reduce:animate-none" />
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <SkeletonCard key={i} />
                ))}
              </div>
            </div>
          }
        >
          <CreateDashboard />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
