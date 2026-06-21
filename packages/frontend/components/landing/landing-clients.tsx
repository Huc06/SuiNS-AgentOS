"use client";

import dynamic from "next/dynamic";
import type { RadialLiquidProps } from "./radial-liquid";
import type { ParallaxPillsProps } from "./parallax-pills";
import type { SquircleShiftProps } from "../react-bits/squircle-shift";
import type { PortalProps } from "../react-bits/portal";

/**
 * Client-only wrappers around the WebGL / window-touching components.
 *
 * RadialLiquid (three.js WebGL) and ParallaxPills (motion + pointer events)
 * both reference `window` / WebGL on mount, so they must never render on the
 * server. `dynamic(..., { ssr: false })` keeps them out of the server bundle
 * while still giving callers a normal component to render.
 */

export const RadialLiquidClient = dynamic<RadialLiquidProps>(
  () => import("./radial-liquid").then((m) => m.RadialLiquid),
  { ssr: false },
);

export const ParallaxPillsClient = dynamic<ParallaxPillsProps>(
  () => import("./parallax-pills").then((m) => m.default),
  { ssr: false },
);

/**
 * SquircleShift (react-three-fiber shader) — used as the footer background.
 * WebGL + a `useTheme()` hook (window-bound) ⇒ client-only.
 */
export const SquircleShiftClient = dynamic<SquircleShiftProps>(
  () => import("../react-bits/squircle-shift").then((m) => m.default),
  { ssr: false },
);

/**
 * Portal (raw three.js circular portal shader) — the "portal into the agent
 * economy" moment. WebGL on mount ⇒ client-only.
 */
export const PortalClient = dynamic<PortalProps>(
  () => import("../react-bits/portal").then((m) => m.default),
  { ssr: false },
);
