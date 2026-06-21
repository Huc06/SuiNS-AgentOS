"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { ScrollReveal } from "./scroll-reveal";

/**
 * A standout text section: a large paragraph where key AgentOS concepts are
 * rendered as inline, icon-bearing colored pills embedded in the sentence,
 * with muted gray lead-in / lead-out lines on a subtle dotted background.
 *
 * Each colored pill is also a hover target: hovering it pops a small,
 * cursor-following preview card (an inline data-URI SVG — mono/purple — with
 * the primitive name + a one-line blurb) that tilts toward the cursor, reusing
 * the same spring/tilt mechanism as `react-bits/hover-preview`. The colored
 * chip + icon styling and the sentence wrapping are kept intact.
 *
 * Client component (cursor tracking + motion). It renders its markup
 * synchronously, so wrapping it does not break static prerendering of `/`.
 */

/* ------------------------------------------------------------------ */
/* Preview card — inline data-URI SVG (no asset files).                */
/* Mono/purple "primitive" card labelled with the concept + blurb.     */
/* ------------------------------------------------------------------ */

function previewCard(opts: {
  label: string;
  sub: string;
  bg: string;
  fg: string;
  accent: string;
}): string {
  const { label, sub, bg, fg, accent } = opts;
  // Wrap the blurb across up to two lines so longer copy stays readable.
  const words = sub.split(" ");
  const mid = Math.ceil(words.length / 2);
  const line1 = words.slice(0, mid).join(" ");
  const line2 = words.slice(mid).join(" ");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="220" height="248" viewBox="0 0 220 248">
  <rect x="6" y="6" width="208" height="236" fill="${bg}" stroke="#000" stroke-width="4"/>
  <rect x="6" y="6" width="208" height="40" fill="${accent}" stroke="#000" stroke-width="4"/>
  <circle cx="28" cy="26" r="7" fill="${bg}" stroke="#000" stroke-width="3"/>
  <text x="46" y="31" font-family="monospace" font-size="13" font-weight="700" fill="#000">AGENTOS</text>
  <text x="22" y="104" font-family="monospace" font-size="24" font-weight="700" fill="${fg}">${label}</text>
  <text x="22" y="134" font-family="monospace" font-size="12" fill="${fg}" opacity="0.72">${line1}</text>
  <text x="22" y="152" font-family="monospace" font-size="12" fill="${fg}" opacity="0.72">${line2}</text>
  <rect x="22" y="172" width="118" height="10" fill="${accent}"/>
  <rect x="22" y="190" width="170" height="8" fill="${fg}" opacity="0.18"/>
  <rect x="22" y="206" width="140" height="8" fill="${fg}" opacity="0.18"/>
  <text x="22" y="232" font-family="monospace" font-size="11" font-weight="700" fill="${accent}">*.sui · on-chain</text>
</svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

interface PillSpec {
  label: string;
  /** Tailwind background + text classes for the pill chip */
  className: string;
  icon: React.ReactNode;
  /** Preview card payload */
  preview: { sub: string; bg: string; fg: string; accent: string };
}

/* Compact inline icons (1em sized, currentColor) */
const ic = {
  passport: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="4" y="3" width="16" height="18" rx="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="9" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8 16h8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
  skills: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <path d="M12 2l2.6 6.3L21 9l-5 4.3L17.5 21 12 17.3 6.5 21 8 13.3 3 9l6.4-.7L12 2z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  ),
  delegation: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <circle cx="6" cy="12" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="6" r="2.5" stroke="currentColor" strokeWidth="2" />
      <circle cx="18" cy="18" r="2.5" stroke="currentColor" strokeWidth="2" />
      <path d="M8.2 10.8l7.6-3.6M8.2 13.2l7.6 3.6" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  walrus: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <ellipse cx="12" cy="6" rx="7" ry="3" stroke="currentColor" strokeWidth="2" />
      <path d="M5 6v12c0 1.66 3.13 3 7 3s7-1.34 7-3V6" stroke="currentColor" strokeWidth="2" />
      <path d="M5 12c0 1.66 3.13 3 7 3s7-1.34 7-3" stroke="currentColor" strokeWidth="2" />
    </svg>
  ),
  harbor: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="5" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M9 11V8a3 3 0 0 1 6 0v3" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="16" r="1.5" fill="currentColor" />
    </svg>
  ),
  workflows: (
    <svg viewBox="0 0 24 24" fill="none" className="h-full w-full">
      <rect x="3" y="4" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <rect x="15" y="15" width="6" height="5" rx="1" stroke="currentColor" strokeWidth="2" />
      <path d="M9 6.5h4a2 2 0 0 1 2 2v9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

const PILLS: Record<
  "passport" | "skills" | "delegation" | "walrus" | "harbor" | "workflows",
  PillSpec
> = {
  passport: {
    label: "AgentPassport",
    className: "bg-electric-purple text-off-white",
    icon: ic.passport,
    preview: {
      sub: "On-chain agent identity",
      bg: "#FAF8F5",
      fg: "#0A0A0A",
      accent: "#6800FF",
    },
  },
  skills: {
    label: "Skills",
    className: "bg-vibrant-blue text-off-white",
    icon: ic.skills,
    preview: {
      sub: "Hash-verified manifest",
      bg: "#0098F5",
      fg: "#FAF8F5",
      accent: "#FAF8F5",
    },
  },
  delegation: {
    label: "Delegation",
    className: "bg-soft-lavender text-pure-black",
    icon: ic.delegation,
    preview: {
      sub: "Scoped sub-agent authority",
      bg: "#CAB1FF",
      fg: "#0A0A0A",
      accent: "#6800FF",
    },
  },
  walrus: {
    label: "Walrus",
    className: "bg-pure-black text-off-white",
    icon: ic.walrus,
    preview: {
      sub: "Decentralized manifest blobs",
      bg: "#0A0A0A",
      fg: "#FAF8F5",
      accent: "#CAB1FF",
    },
  },
  harbor: {
    label: "Harbor",
    className: "bg-[#13b981] text-off-white",
    icon: ic.harbor,
    preview: {
      sub: "Seal-encrypted private skills",
      bg: "#0F5132",
      fg: "#FAF8F5",
      accent: "#13b981",
    },
  },
  workflows: {
    label: "Workflows",
    className: "bg-[#f59e0b] text-pure-black",
    icon: ic.workflows,
    preview: {
      sub: "Multi-step on-chain settlement",
      bg: "#FAF8F5",
      fg: "#0A0A0A",
      accent: "#f59e0b",
    },
  },
};

const PILL_KEYS = Object.keys(PILLS) as (keyof typeof PILLS)[];

/* Pre-render the preview image src for each pill once. */
const PILL_IMAGES: Record<string, string> = Object.fromEntries(
  PILL_KEYS.map((key) => {
    const p = PILLS[key];
    return [key, previewCard({ label: p.label, ...p.preview })];
  }),
);

const PREVIEW_W = 220;
const PREVIEW_H = 248;
const MAX_ROTATION = 10;
const MAX_OFFSET = 14;

/* ------------------------------------------------------------------ */
/* Hover pill — colored chip + icon that doubles as a hover target.    */
/* ------------------------------------------------------------------ */

function HoverPill({
  pillKey,
  onEnter,
  onMove,
  onLeave,
}: {
  pillKey: keyof typeof PILLS;
  onEnter: (key: keyof typeof PILLS, e: React.MouseEvent<HTMLSpanElement>) => void;
  onMove: (key: keyof typeof PILLS, e: React.MouseEvent<HTMLSpanElement>) => void;
  onLeave: () => void;
}) {
  const pill = PILLS[pillKey];
  return (
    <span
      onMouseEnter={(e) => onEnter(pillKey, e)}
      onMouseMove={(e) => onMove(pillKey, e)}
      onMouseLeave={onLeave}
      className={
        "mx-1 inline-flex translate-y-[0.12em] cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full border-2 border-pure-black px-3 py-0.5 align-baseline font-mono text-[0.7em] font-bold uppercase tracking-tight shadow-[2px_2px_0_0_#000] transition-transform duration-150 hover:-translate-y-[0.02em] hover:shadow-[3px_3px_0_0_#000] " +
        pill.className
      }
    >
      <span className="flex h-[1.1em] w-[1.1em] items-center justify-center">
        {pill.icon}
      </span>
      {pill.label}
    </span>
  );
}

export function InlinePillsText() {
  const reduced = useReducedMotion() ?? false;
  const [hoveredKey, setHoveredKey] = useState<keyof typeof PILLS | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /* Preload preview images. */
  useEffect(() => {
    PILL_KEYS.forEach((key) => {
      const img = new Image();
      img.src = PILL_IMAGES[key];
    });
  }, []);

  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);
  const rotation = useMotionValue(0);
  const offsetX = useMotionValue(0);
  const offsetY = useMotionValue(0);

  const smoothCursorX = useSpring(cursorX, { stiffness: 250, damping: 20 });
  const smoothCursorY = useSpring(cursorY, { stiffness: 250, damping: 20 });
  const smoothRotation = useSpring(rotation, { stiffness: 150, damping: 15 });
  const smoothOffsetX = useSpring(offsetX, { stiffness: 150, damping: 15 });
  const smoothOffsetY = useSpring(offsetY, { stiffness: 150, damping: 15 });

  // Preview floats above the cursor, horizontally centered on it.
  const finalX = useTransform(
    () => smoothCursorX.get() - PREVIEW_W / 2 + smoothOffsetX.get(),
  );
  const finalY = useTransform(
    () => smoothCursorY.get() - PREVIEW_H - 24 + smoothOffsetY.get(),
  );

  const handleEnter = useCallback(
    (key: keyof typeof PILLS, e: React.MouseEvent<HTMLSpanElement>) => {
      if (hideTimeoutRef.current) {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = null;
      }
      const isFirstHover = !isVisible;
      if (isFirstHover) {
        cursorX.jump(e.clientX);
        cursorY.jump(e.clientY);
        smoothCursorX.jump(e.clientX);
        smoothCursorY.jump(e.clientY);
        rotation.jump(0);
        smoothRotation.jump(0);
        offsetX.jump(0);
        smoothOffsetX.jump(0);
        offsetY.jump(0);
        smoothOffsetY.jump(0);
      }
      setHoveredKey(key);
      setIsVisible(true);
    },
    [
      isVisible,
      cursorX,
      cursorY,
      smoothCursorX,
      smoothCursorY,
      rotation,
      smoothRotation,
      offsetX,
      smoothOffsetX,
      offsetY,
      smoothOffsetY,
    ],
  );

  const handleMove = useCallback(
    (key: keyof typeof PILLS, e: React.MouseEvent<HTMLSpanElement>) => {
      if (hoveredKey !== key) return;
      const currentX = e.clientX;
      const currentY = e.clientY;
      cursorX.set(currentX);
      cursorY.set(currentY);

      const rect = e.currentTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = currentX - centerX;
      const deltaY = currentY - centerY;

      rotation.set(
        Math.max(
          -MAX_ROTATION,
          Math.min(MAX_ROTATION, (deltaX / rect.width) * MAX_ROTATION * 2),
        ),
      );
      offsetX.set(
        Math.max(
          -MAX_OFFSET,
          Math.min(MAX_OFFSET, (deltaX / rect.width) * MAX_OFFSET * 2),
        ),
      );
      offsetY.set(
        Math.max(
          -MAX_OFFSET,
          Math.min(MAX_OFFSET, (deltaY / rect.height) * MAX_OFFSET * 2),
        ),
      );
    },
    [hoveredKey, cursorX, cursorY, rotation, offsetX, offsetY],
  );

  const handleLeave = useCallback(() => {
    hideTimeoutRef.current = setTimeout(() => {
      setHoveredKey(null);
      setIsVisible(false);
    }, 50);
  }, []);

  const pillProps = { onEnter: handleEnter, onMove: handleMove, onLeave: handleLeave };

  return (
    <section className="relative overflow-hidden border-t-2 border-pure-black bg-off-white py-24 md:py-36">
      {/* Subtle dotted background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.5]"
        style={{
          backgroundImage: "radial-gradient(#00000022 1.2px, transparent 1.2px)",
          backgroundSize: "20px 20px",
        }}
      />
      <ScrollReveal className="relative z-10 mx-auto max-w-container px-margin">
        <div className="mx-auto max-w-4xl">
          <p className="mb-6 font-mono text-xs font-bold uppercase tracking-[0.2em] text-on-surface-variant/60">
            What AgentOS gives every agent
          </p>
          <p className="font-display text-3xl font-medium leading-[1.5] tracking-tight text-pure-black md:text-[2.6rem] md:leading-[1.5]">
            <span className="text-on-surface-variant/50">
              AgentOS is the Sui-native identity layer for AI agents —
            </span>{" "}
            give every agent a
            <HoverPill pillKey="passport" {...pillProps} />
            expose verifiable
            <HoverPill pillKey="skills" {...pillProps} />
            grant scoped
            <HoverPill pillKey="delegation" {...pillProps} />
            store manifests on
            <HoverPill pillKey="walrus" {...pillProps} />
            seal private skills with
            <HoverPill pillKey="harbor" {...pillProps} />
            and run
            <HoverPill pillKey="workflows" {...pillProps} />{" "}
            <span className="text-on-surface-variant/50">
              that settle on-chain — resolvable anywhere by a single *.sui name.
            </span>
          </p>
          <p className="mt-8 font-mono text-xs text-on-surface-variant/60">
            Hover a pill to preview the primitive.
          </p>
        </div>
      </ScrollReveal>

      {/* Cursor-following preview card. Disabled under reduced motion. */}
      {!reduced && (
        <motion.div
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{
            opacity: isVisible ? 1 : 0,
            scale: isVisible ? 1 : 0.85,
          }}
          transition={{
            duration: isVisible ? 0.2 : 0.15,
            ease: isVisible ? "easeOut" : "easeIn",
          }}
          style={{
            position: "fixed",
            left: 0,
            top: 0,
            x: finalX,
            y: finalY,
            width: PREVIEW_W,
            height: PREVIEW_H,
            rotate: smoothRotation,
            pointerEvents: "none",
            zIndex: 9999,
            willChange: "transform, opacity",
          }}
        >
          <AnimatePresence mode="popLayout" initial={false}>
            {hoveredKey !== null && (
              <motion.div
                key={`preview-${hoveredKey}`}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ duration: 0.2, ease: "easeInOut" }}
                className="absolute left-0 top-0 h-full w-full"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={PILL_IMAGES[hoveredKey]}
                  alt={`${PILLS[hoveredKey].label} primitive preview`}
                  width={PREVIEW_W}
                  height={PREVIEW_H}
                  className="object-cover shadow-2xl"
                  style={{ width: PREVIEW_W, height: PREVIEW_H }}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </section>
  );
}

export default InlinePillsText;
