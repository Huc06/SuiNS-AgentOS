"use client";

import { ConnectButton } from "@mysten/dapp-kit";
import Link from "next/link";
import { useState } from "react";

import { MobileNavDrawer } from "./mobile-nav-drawer";
import { SiteBreadcrumb, type BreadcrumbItem } from "./site-breadcrumb";

type NavItem =
  | { href: string; label: string; active?: boolean; external?: false }
  | { href: string; label: string; external: true };

const nav: NavItem[] = [
  { href: "/explore", label: "Explore" },
  { href: "/create", label: "Dashboard" },
  {
    href: "https://github.com/Huc06/SuiNS-AgentOS",
    label: "Docs",
    external: true,
  },
];

type SiteHeaderProps = {
  activeHref?: string;
  breadcrumbs?: BreadcrumbItem[];
};

export function SiteHeader({ activeHref = "/", breadcrumbs }: SiteHeaderProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <header className="sticky top-0 z-50 border-b-2 border-pure-black bg-off-white">
        <div className="mx-auto flex max-w-container items-center justify-between px-margin py-4">
          <div className="flex items-center gap-8">
            <Link
              href="/"
              className="font-display text-xl font-black uppercase tracking-tighter text-on-surface"
            >
              AgentOS
            </Link>
            <nav className="hidden items-center gap-6 md:flex">
              {nav.map((item) =>
                item.external ? (
                  <a
                    key={item.href}
                    href={item.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-sm font-bold text-on-surface-variant transition-colors hover:text-pure-black"
                  >
                    {item.label}
                  </a>
                ) : (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={
                      activeHref === item.href
                        ? "border-b-2 border-electric-purple pb-1 font-mono text-sm font-bold text-electric-purple"
                        : "font-mono text-sm font-bold text-on-surface-variant transition-colors hover:text-pure-black"
                    }
                  >
                    {item.label}
                  </Link>
                ),
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden md:block [&_button]:!font-mono [&_button]:!text-sm [&_button]:!font-bold [&_button]:!border-2 [&_button]:!border-pure-black [&_button]:!neo-shadow">
              <ConnectButton />
            </div>
            <button
              type="button"
              onClick={() => setDrawerOpen(true)}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center border-2 border-pure-black p-2 md:hidden"
              aria-label="Open navigation menu"
              aria-expanded={drawerOpen}
            >
              <span className="font-mono text-lg leading-none">≡</span>
            </button>
          </div>
        </div>
        <SiteBreadcrumb items={breadcrumbs} />
      </header>

      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        nav={nav}
        activeHref={activeHref}
      />
    </>
  );
}
