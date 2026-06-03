'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

function buildCrumbs(pathname: string): BreadcrumbItem[] | null {
  if (pathname === '/') return null;

  const explore: BreadcrumbItem = { label: 'Explore', href: '/' };

  if (pathname === '/create') {
    return [explore, { label: 'Dashboard' }];
  }

  const agentMatch = pathname.match(/^\/agent\/([^/]+)(?:\/(.*))?$/);
  if (agentMatch) {
    const slug = decodeURIComponent(agentMatch[1]);
    const sub = agentMatch[2];
    const agentHref = `/agent/${slug}`;
    const crumbs: BreadcrumbItem[] = [
      explore,
      { label: 'Dashboard', href: '/create' },
      { label: `@${slug}`, href: agentHref },
    ];

    if (sub === 'skills') {
      crumbs.push({ label: 'Analytics' });
    } else if (sub === 'delegate') {
      crumbs.push({ label: 'Delegation' });
    } else {
      crumbs.push({ label: 'Manage Skills' });
    }
    return crumbs;
  }

  return [explore, { label: 'Page' }];
}

type SiteBreadcrumbProps = {
  items?: BreadcrumbItem[];
};

export function SiteBreadcrumb({ items }: SiteBreadcrumbProps) {
  const pathname = usePathname();
  const crumbs = items ?? buildCrumbs(pathname);

  if (!crumbs?.length) return null;

  return (
    <nav aria-label="Breadcrumb" className="border-t-2 border-pure-black/10 bg-off-white">
      <ol className="mx-auto flex max-w-container flex-wrap items-center gap-1 px-margin py-2 font-mono text-xs font-bold md:text-sm">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={`${crumb.label}-${i}`} className="flex items-center gap-1">
              {i > 0 && (
                <span className="text-on-surface-variant/50" aria-hidden>
                  /
                </span>
              )}
              {crumb.href && !isLast ? (
                <Link
                  href={crumb.href}
                  className="text-on-surface-variant transition-colors hover:text-electric-purple"
                >
                  {crumb.label}
                </Link>
              ) : (
                <span className={isLast ? 'text-electric-purple' : 'text-on-surface-variant'}>
                  {crumb.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
