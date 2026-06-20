"use client";

import { ConnectButton } from "@mysten/dapp-kit";
import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Vertical app sidebar — matches Tools Panel style (off-white, 2px borders, purple accents).
 */
export function AppSidebar() {
  const pathname = usePathname();
  const isAgentPage = pathname.startsWith("/agent/");

  if (isAgentPage) return null;

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-16 flex-col border-r-2 border-pure-black bg-off-white py-4 md:w-56">
      {/* Header */}
      <div className="border-b-2 border-pure-black px-4 py-3">
        <Link href="/" className="font-mono text-sm font-bold text-on-surface">
          AGENTOS
        </Link>
      </div>

      {/* Platform section */}
      <div className="border-b border-pure-black/10 px-4 py-2">
        <p className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
          Platform
        </p>
      </div>
      <nav className="space-y-1 p-2">
        <SidebarLink
          href="/create"
          label="Workflows"
          active={pathname === "/create" || pathname.startsWith("/create/")}
        />
        <SidebarLink
          href="/explore"
          label="Portfolio"
          active={pathname === "/explore"}
        />
      </nav>

      {/* Resources section */}
      <div className="border-b border-pure-black/10 border-t border-t-pure-black/10 px-4 py-2">
        <p className="font-mono text-[10px] font-bold uppercase text-on-surface-variant">
          Resources
        </p>
      </div>
      <nav className="space-y-1 p-2">
        <SidebarLink href="/" label="Home" active={pathname === "/"} />
        <a
          href="https://github.com/Huc06/SuiNS-AgentOS"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center px-3 py-2 font-mono text-xs font-bold text-on-surface-variant transition-all hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#6800FF]"
        >
          Docs
        </a>
      </nav>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Bottom */}
      <div className="space-y-1 border-t-2 border-pure-black p-2">
        <div className="px-3 py-2 font-mono text-[10px] text-on-surface-variant">
          Open Source
        </div>
        <div className="[&_button]:!w-full [&_button]:!border-2 [&_button]:!border-pure-black [&_button]:!bg-white [&_button]:!px-3 [&_button]:!py-2 [&_button]:!font-mono [&_button]:!text-[10px] [&_button]:!font-bold [&_button]:!text-on-surface [&_button]:hover:!-translate-y-0.5 [&_button]:hover:!shadow-[2px_2px_0_0_#6800FF]">
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
      className={`flex items-center px-3 py-2 font-mono text-xs font-bold transition-all ${
        active
          ? "border-2 border-pure-black bg-electric-purple/10 text-electric-purple shadow-[2px_2px_0_0_#6800FF]"
          : "text-on-surface-variant hover:-translate-y-0.5 hover:shadow-[2px_2px_0_0_#6800FF] hover:text-on-surface"
      }`}
    >
      {label}
    </Link>
  );
}
