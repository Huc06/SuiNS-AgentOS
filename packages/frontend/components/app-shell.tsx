"use client";

import { usePathname } from "next/navigation";

import { AppSidebar } from "./app-sidebar";

/**
 * AppShell decides whether the current route is a standalone marketing page
 * (the landing `/`) or a platform route (everything else). The landing is
 * rendered full-width with no app sidebar and no left offset; platform routes
 * keep the fixed <AppSidebar /> plus the ml-16/md:ml-56 main offset.
 */
export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isLanding = pathname === "/";

  if (isLanding) {
    return (
      <div id="main-content" className="relative z-10 min-h-screen">
        {children}
      </div>
    );
  }

  return (
    <div className="relative z-10 flex min-h-screen">
      <AppSidebar />
      <div id="main-content" className="ml-16 flex-1 md:ml-56">
        {children}
      </div>
    </div>
  );
}
