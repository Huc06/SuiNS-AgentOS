"use client";

import { motion, useScroll, useSpring, useReducedMotion } from "motion/react";

/**
 * A thin, fixed scroll-progress accent at the very top of the landing page.
 *
 * Reads document scroll progress (0→1) and scales a 2px electric-purple bar.
 * Spring-smoothed for a subtle, on-brand feel. Hidden entirely under reduced
 * motion (the bar would otherwise jitter and adds no information for those
 * users). Purely decorative (aria-hidden) and `pointer-events-none`, so it
 * never intercepts clicks or causes layout shift.
 */
export function ScrollProgress() {
  const reduced = useReducedMotion() ?? false;
  const { scrollYProgress } = useScroll();
  const scaleX = useSpring(scrollYProgress, {
    stiffness: 120,
    damping: 24,
    restDelta: 0.001,
  });

  if (reduced) return null;

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-[3px] origin-left bg-electric-purple"
      style={{ scaleX }}
    />
  );
}

export default ScrollProgress;
