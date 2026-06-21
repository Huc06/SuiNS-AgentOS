"use client";

import dynamic from "next/dynamic";
import type { RadialLiquidProps } from "./radial-liquid";
import type { ParallaxPillsProps } from "./parallax-pills";

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
