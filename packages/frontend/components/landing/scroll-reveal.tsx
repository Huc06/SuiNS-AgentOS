"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ComponentPropsWithoutRef, ElementType, ReactNode } from "react";

/**
 * Scroll-reveal primitives for the landing page.
 *
 * Sections fade + rise + un-blur into view as the user scrolls down, animating
 * exactly once (`once: true`) and only after a slice of the element has crossed
 * the viewport edge (negative bottom margin so the reveal fires a touch early).
 *
 * Reduced-motion is respected end-to-end: when the user prefers reduced motion
 * we drop the translate/blur and fall back to a tiny opacity fade so content is
 * still revealed without movement. All variants animate *to* the resting state,
 * so there is never a permanent overlay or layout shift — the element occupies
 * its final box from first paint, only its paint (opacity/transform/filter)
 * animates.
 *
 * These are client components (motion + reduced-motion media query), but they
 * render their children synchronously, so wrapping server-rendered section
 * markup in them does not break static prerendering of `/`.
 */

type RevealDirection = "up" | "down" | "left" | "right" | "none";

const DEFAULT_DISTANCE = 28;

function buildVariants(
  reduced: boolean,
  direction: RevealDirection,
  distance: number,
  blur: number,
): Variants {
  if (reduced) {
    return {
      hidden: { opacity: 0 },
      visible: { opacity: 1 },
    };
  }

  const offset = (() => {
    switch (direction) {
      case "up":
        return { y: distance };
      case "down":
        return { y: -distance };
      case "left":
        return { x: distance };
      case "right":
        return { x: -distance };
      default:
        return {};
    }
  })();

  return {
    hidden: {
      opacity: 0,
      filter: blur > 0 ? `blur(${blur}px)` : "blur(0px)",
      ...offset,
    },
    visible: {
      opacity: 1,
      filter: "blur(0px)",
      x: 0,
      y: 0,
    },
  };
}

export interface ScrollRevealProps<T extends ElementType = "div"> {
  children: ReactNode;
  /** Wrapper element/tag. Defaults to a plain div. */
  as?: T;
  className?: string;
  /** Travel direction of the rise. */
  direction?: RevealDirection;
  /** Travel distance in px before settling (ignored for reduced motion). */
  distance?: number;
  /** Entry blur in px (ignored for reduced motion). */
  blur?: number;
  /** Stagger / entrance delay in seconds. */
  delay?: number;
  /** Duration in seconds. */
  duration?: number;
  /**
   * Viewport root margin. Negative bottom fires the reveal slightly before the
   * element fully enters; default reveals once ~12% is on screen.
   */
  margin?: string;
  /** Fraction of the element that must be visible to trigger. */
  amount?: number | "some" | "all";
}

export function ScrollReveal<T extends ElementType = "div">({
  children,
  as,
  className,
  direction = "up",
  distance = DEFAULT_DISTANCE,
  blur = 6,
  delay = 0,
  duration = 0.6,
  margin = "0px 0px -12% 0px",
  amount = 0.2,
  ...rest
}: ScrollRevealProps<T> &
  Omit<ComponentPropsWithoutRef<T>, keyof ScrollRevealProps<T>>) {
  const reduced = useReducedMotion() ?? false;
  const MotionTag = motion[(as ?? "div") as "div"] as typeof motion.div;
  const variants = buildVariants(reduced, direction, distance, blur);

  return (
    <MotionTag
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, margin, amount }}
      transition={{
        duration: reduced ? 0.4 : duration,
        delay: reduced ? 0 : delay,
        ease: [0.21, 0.5, 0.27, 0.99],
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

/**
 * Container that staggers its direct {@link RevealChild} descendants. Combine
 * with `RevealChild` for a top-to-bottom cascade within one section.
 */
export function RevealGroup<T extends ElementType = "div">({
  children,
  as,
  className,
  stagger = 0.1,
  delayChildren = 0,
  margin = "0px 0px -12% 0px",
  amount = 0.2,
  /**
   * When true, the cascade fires once on mount (`animate`) instead of waiting
   * for the element to scroll into view. Use for above-the-fold sections (the
   * hero) so they "arrive" after the preloader lifts.
   */
  onMount = false,
  ...rest
}: {
  children: ReactNode;
  as?: T;
  className?: string;
  stagger?: number;
  delayChildren?: number;
  margin?: string;
  amount?: number | "some" | "all";
  onMount?: boolean;
} & Omit<ComponentPropsWithoutRef<T>, "children" | "className">) {
  const reduced = useReducedMotion() ?? false;
  const MotionTag = motion[(as ?? "div") as "div"] as typeof motion.div;

  const trigger = onMount
    ? { animate: "visible" as const }
    : {
        whileInView: "visible" as const,
        viewport: { once: true, margin, amount },
      };

  return (
    <MotionTag
      className={className}
      initial="hidden"
      {...trigger}
      variants={{
        hidden: {},
        visible: {
          transition: {
            staggerChildren: reduced ? 0 : stagger,
            delayChildren: reduced ? 0 : delayChildren,
          },
        },
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

/** A single staggered item inside a {@link RevealGroup}. */
export function RevealChild<T extends ElementType = "div">({
  children,
  as,
  className,
  direction = "up",
  distance = DEFAULT_DISTANCE,
  blur = 6,
  duration = 0.55,
  ...rest
}: {
  children: ReactNode;
  as?: T;
  className?: string;
  direction?: RevealDirection;
  distance?: number;
  blur?: number;
  duration?: number;
} & Omit<ComponentPropsWithoutRef<T>, "children" | "className">) {
  const reduced = useReducedMotion() ?? false;
  const MotionTag = motion[(as ?? "div") as "div"] as typeof motion.div;
  const variants = buildVariants(reduced, direction, distance, blur);

  return (
    <MotionTag
      className={className}
      variants={variants}
      transition={{
        duration: reduced ? 0.4 : duration,
        ease: [0.21, 0.5, 0.27, 0.99],
      }}
      {...rest}
    >
      {children}
    </MotionTag>
  );
}

export default ScrollReveal;
