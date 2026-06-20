"use client";

import { ConnectButton } from "@mysten/dapp-kit";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Vertical app sidebar — light mode.
 * Subtle gray bg, clean typography, purple active state.
 */
export function AppSidebar() {
  const pathname = usePathname();
  const isAgentPage = pathname.startsWith("/agent/");

  if (isAgentPage) return null;

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-16 flex-col border-r border-gray-200 bg-[#f8f8fa] py-4 md:w-56">
      {/* Logo */}
      <Link href="/" className="mb-6 flex items-center gap-2 px-4">
        <span className="font-display text-sm font-bold text-on-surface">
          AgentOS
        </span>
        <span className="hidden font-mono text-[10px] text-on-surface-variant md:inline">
          Workflow Automation
        </span>
      </Link>

      {/* Section: Platform */}
      <div className="px-4">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          Platform
        </p>
        <nav className="space-y-1">
          <SidebarLink
            href="/create"
            label="Workflows"
            active={pathname === "/create"}
          />
          <SidebarLink
            href="/explore"
            label="Portfolio"
            active={pathname === "/explore"}
          />
        </nav>
      </div>

      {/* Section: Resources */}
      <div className="mt-6 px-4">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-wider text-on-surface-variant">
          Resources
        </p>
        <nav className="space-y-1">
          <SidebarLink href="/" label="Home" active={pathname === "/"} />
          <a
            href="https://github.com/Huc06/SuiNS-AgentOS"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center px-3 py-2 font-mono text-xs text-on-surface-variant transition-colors hover:bg-gray-100 hover:text-on-surface"
          >
            Docs
          </a>
        </nav>
      </div>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom */}
      <div className="space-y-2 px-4">
        <a
          href="https://github.com/Huc06/SuiNS-AgentOS"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 px-3 py-2 font-mono text-[10px] text-on-surface-variant hover:text-on-surface"
        >
          Open Source
        </a>
        <div className="[&_button]:!w-full [&_button]:!justify-start [&_button]:!border [&_button]:!border-gray-200 [&_button]:!bg-white [&_button]:!px-3 [&_button]:!py-2 [&_button]:!font-mono [&_button]:!text-[10px] [&_button]:!font-bold [&_button]:!text-on-surface">
          <ConnectButton />
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({
  href,
  label,
  active,
}: {
  href: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center px-3 py-2 font-mono text-xs font-bold transition-colors ${
        active
          ? "bg-electric-purple/10 text-electric-purple"
          : "text-on-surface-variant hover:bg-gray-100 hover:text-on-surface"
      }`}
    >
      {label}
    </Link>
  );
}
