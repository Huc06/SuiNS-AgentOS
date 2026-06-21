"use client";

import { useEffect, useState } from "react";
import Preloader from "../react-bits/preloader";

/**
 * Page-entry preloader for the landing page.
 *
 * Shows the {@link Preloader} on every mount (i.e. every reload of `/`), then
 * reveals the landing children. It always transitions to `loading=false` after
 * a short, fixed delay so the content is *never* permanently covered — even if
 * something downstream throws. Reduced-motion is respected (the Preloader falls
 * back to a plain fade and we shorten the hold).
 *
 * Scope: wrap ONLY the landing page, not the global app/[slug] dashboard.
 */
export function EntryPreloader({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Honour reduced-motion by holding the overlay for a shorter beat.
    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    const hold = prefersReduced ? 700 : 1800;
    const timer = setTimeout(() => setLoading(false), hold);
    return () => clearTimeout(timer);
  }, []);

  return (
    <Preloader
      loading={loading}
      variant="curtain"
      position="fixed"
      zIndex={9999}
      duration={1800}
      bgColor="#6800FF"
      loadingText="AGENTOS"
      textClassName="font-display uppercase tracking-tight text-off-white"
      respectReducedMotion
      reducedMotionFallback="fade"
      ariaLabel="Loading AgentOS"
    >
      {children}
    </Preloader>
  );
}

export default EntryPreloader;
