"use client";

import { ConnectButton } from "@mysten/dapp-kit";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppSidebar() {
  const pathname = usePathname();
  if (pathname.startsWith("/agent/")) return null;

  return (
    <aside className="fixed left-0 top-0 z-50 flex h-screen w-16 flex-col border-r-2 border-pure-black bg-off-white py-4 md:w-56">
      <div className="px-4 py-3">
        <Link href="/" className="font-mono text-sm font-bold text-black">
          AGENTOS
        </Link>
      </div>

      <div className="px-4 py-2">
        <p className="font-mono text-[10px] font-bold uppercase text-black/50">
          Platform
        </p>
      </div>
      <nav className="space-y-1 px-2">
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

      <div className="mt-4 px-4 py-2">
        <p className="font-mono text-[10px] font-bold uppercase text-black/50">
          Resources
        </p>
      </div>
      <nav className="space-y-1 px-2">
        <SidebarLink href="/" label="Home" active={pathname === "/"} />
      </nav>

      <div className="flex-1" />

      <div className="px-2">
        <div className="[&_button]:!w-full [&_button]:!border-2 [&_button]:!border-pure-black [&_button]:!bg-white [&_button]:!px-3 [&_button]:!py-2 [&_button]:!font-mono [&_button]:!text-[10px] [&_button]:!font-bold [&_button]:!text-black">
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
          : "text-black/60 hover:-translate-y-0.5 hover:text-black hover:shadow-[2px_2px_0_0_#6800FF]"
      }`}
    >
      {label}
    </Link>
  );
}
