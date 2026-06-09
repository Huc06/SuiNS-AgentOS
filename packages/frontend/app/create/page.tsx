import { Suspense } from 'react';

import { CreateDashboard } from '../../components/dashboard/create-dashboard';
import { SiteFooter } from '../../components/site-footer';
import { SiteHeader } from '../../components/site-header';

export default function CreatePage() {
  return (
    <>
      <SiteHeader activeHref="/create" />
      <main className="mx-auto max-w-container px-margin pb-24 pt-32">
        <Suspense
          fallback={
            <p className="font-mono text-sm text-on-surface-variant">Loading workspace…</p>
          }
        >
          <CreateDashboard />
        </Suspense>
      </main>
      <SiteFooter />
    </>
  );
}
