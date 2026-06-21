"use client";

import React, { useEffect, useMemo, useRef } from "react";
import {
  motion,
  useInView,
  useMotionValue,
  useSpring,
  useTransform,
  type Transition,
} from "motion/react";
import { cn } from "@/lib/utils";

export interface ParallaxPillItem {
  /** Pill label */
  label: string;
  /** Pill background fill in hex */
  background: string;
  /** Label color in hex */
  color: string;
  /**
   * Position on the canvas as percentages of the container size.
   * `x` is the pill's center, `y` is the pill's center, both 0–100.
   */
  x: number;
  y: number;
  /** Pill width as a percentage of the container width (1–100) */
  width: number;
  /** Resting rotation in degrees */
  rotate?: number;
  /**
   * Per-pill parallax multiplier (0 = static, 1 = baseline drift, 2 = double).
   * If omitted, a deterministic value is derived from the pill's index.
   */
  parallax?: number;
}

export interface ParallaxPillsProps {
  /** Foreground pills; defaults to a 5-pill financial layout. */
  pills?: ParallaxPillItem[];
  /** Decorative pills behind the foreground (no labels). */
  backgroundPills?: Omit<ParallaxPillItem, "label" | "color">[];
  /** Container width */
  width?: string | number;
  /** Container height */
  height?: string | number;
  /** Additional CSS classes for the outer container */
  className?: string;
  /** Pill border-radius in px */
  pillRadius?: number;
  /** Pill vertical height in px */
  pillHeight?: number;
  /** Label font size in px */
  fontSize?: number;
  /** Label font weight */
  fontWeight?: number | string;
  /** Maximum cursor parallax displacement in px (mapped to ±strength) */
  parallaxStrength?: number;
  /** Disable cursor parallax entirely */
  disableParallax?: boolean;
  /** Hide the decorative unlabeled background pills */
  disableEmptyPills?: boolean;
  /** Disable the elastic entry animation (renders pills in their resting state) */
  disableEntry?: boolean;
  /** Stagger between pill entry animations in seconds */
  entryStagger?: number;
  /** Spring stiffness for the entry bounce (lower = floppier) */
  entryStiffness?: number;
  /** Spring damping for the entry bounce (lower = more oscillation) */
  entryDamping?: number;
  /**
   * How far above their resting position pills start (percent of pill
   * height). Larger values make pills fall from higher up. Default 220.
   */
  entryDistance?: number;
  /** Spring stiffness for the parallax drift (lower = laggier) */
  parallaxStiffness?: number;
  /** Spring damping for the parallax drift */
  parallaxDamping?: number;
  /**
   * Probability (0–1) that any given pill enters with a "hinge" tilt — one
   * end hanging lower as if heavier, then springing back to its resting
   * rotation. 0 disables the effect, 1 hinges every pill.
   */
  hingeChance?: number;
  /**
   * Magnitude of the initial hinge tilt in degrees. The pill's heavy end
   * starts this far past its resting rotation, then springs back.
   */
  hingeAngle?: number;
}

const DEFAULT_PILLS: ParallaxPillItem[] = [
  {
    label: "Components",
    background: "#0A0A0A",
    color: "#FFFFFF",
    x: 35,
    y: 28,
    width: 32,
    rotate: -3,
  },
  {
    label: "Animations",
    background: "#FFFFFF",
    color: "#0A0A0A",
    x: 70,
    y: 30,
    width: 28,
    rotate: 2,
  },
  {
    label: "Backgrounds",
    background: "#0A0A0A",
    color: "#FFFFFF",
    x: 50,
    y: 50,
    width: 38,
    rotate: 4,
  },
  {
    label: "Text Effects",
    background: "#FFFFFF",
    color: "#0A0A0A",
    x: 35,
    y: 72,
    width: 30,
    rotate: -2,
  },
  {
    label: "Blocks + Templates",
    background: "#0A0A0A",
    color: "#FFFFFF",
    x: 70,
    y: 72,
    width: 32,
    rotate: 3,
  },
];

const DEFAULT_BG_PILLS: Omit<ParallaxPillItem, "label" | "color">[] = [
  { background: "#E8F1ED", x: 6, y: 22, width: 24, rotate: 0 },
  { background: "#E8F1ED", x: 96, y: 26, width: 20, rotate: 0 },
  { background: "#F4EAE0", x: 12, y: 50, width: 22, rotate: 0 },
  { background: "#F4EAE0", x: 92, y: 52, width: 20, rotate: 0 },
  { background: "#E8F1ED", x: 8, y: 76, width: 24, rotate: 0 },
  { background: "#E8F1ED", x: 96, y: 74, width: 20, rotate: 0 },
];

const hexLuminance = (hex: string): number => {
  if (typeof hex !== "string") return 1;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6) return 1;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some((v) => Number.isNaN(v))) return 1;
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
};

interface PillProps {
  pill: ParallaxPillItem;
  index: number;
  total: number;
  pillHeight: number;
  pillRadius: number;
  fontSize: number;
  fontWeight: number | string;
  parallaxStrength: number;
  pointerX: ReturnType<typeof useMotionValue<number>>;
  pointerY: ReturnType<typeof useMotionValue<number>>;
  parallaxStiffness: number;
  parallaxDamping: number;
  hingeChance: number;
  hingeAngle: number;
  entry: boolean;
  play: boolean;
  entryStagger: number;
  entryStiffness: number;
  entryDamping: number;
  entryDistance: number;
  isBackground?: boolean;
  hideLabel?: boolean;
}

const Pill: React.FC<PillProps> = ({
  pill,
  index,
  total,
  pillHeight,
  pillRadius,
  fontSize,
  fontWeight,
  parallaxStrength,
  pointerX,
  pointerY,
  parallaxStiffness,
  parallaxDamping,
  hingeChance,
  hingeAngle,
  entry,
  play,
  entryStagger,
  entryStiffness,
  entryDamping,
  entryDistance,
  isBackground,
  hideLabel,
}) => {
  const multiplier = useMemo(() => {
    if (typeof pill.parallax === "number") return pill.parallax;
    const t = ((index * 0.6180339887) % 1);
    const base = 0.5 + t * 1.1;
    return isBackground ? base * 0.35 : base;
  }, [pill.parallax, index, isBackground]);

  const hinge = useMemo(() => {
    if (isBackground || !entry || hingeChance <= 0) {
      return { active: false, side: 0 as -1 | 0 | 1 };
    }
    const roll = Math.random();
    if (roll >= hingeChance) return { active: false, side: 0 as -1 | 0 | 1 };
    const side: -1 | 1 = Math.random() < 0.5 ? -1 : 1;
    return { active: true, side };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry, hingeChance, isBackground]);

  const restRotate = pill.rotate ?? 0;
  const initialRotate = hinge.active
    ? restRotate + hinge.side * hingeAngle
    : 0;
  const transformOrigin = hinge.active
    ? hinge.side === 1
      ? "0% 50%"
      : "100% 50%"
    : "50% 50%";

  const isDarkPill = hexLuminance(pill.background) < 0.5;
  const boxShadow = isDarkPill
    ? "inset 0 0 0 1px rgba(255,255,255,0.10), 0 1px 2px rgba(0,0,0,0.5), 0 8px 24px rgba(255,255,255,0.06)"
    : "inset 0 0 0 1px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.04), 0 8px 24px rgba(0,0,0,0.08)";
  const xSmooth = useSpring(pointerX, {
    stiffness: parallaxStiffness,
    damping: parallaxDamping,
    mass: 1,
  });
  const ySmooth = useSpring(pointerY, {
    stiffness: parallaxStiffness,
    damping: parallaxDamping,
    mass: 1,
  });
  const tx = useTransform(xSmooth, (v) => v * parallaxStrength * multiplier);
  const ty = useTransform(
    ySmooth,
    (v) => v * parallaxStrength * multiplier * 0.6,
  );

  const entryTransition: Transition = {
    type: "spring",
    stiffness: entryStiffness,
    damping: entryDamping,
    mass: 1,
    delay: entry && play ? index * entryStagger : 0,
  };

  return (
    <motion.div
      style={{
        position: "absolute",
        left: `${pill.x}%`,
        top: `${pill.y}%`,
        width: `${pill.width}%`,
        height: pillHeight,
        x: tx,
        y: ty,
        translateX: "-50%",
        translateY: "-50%",
        zIndex: isBackground ? 0 : 1 + index,
        pointerEvents: "none",
      }}
    >
      <motion.div
        initial={
          entry
            ? { y: `-${entryDistance}%`, opacity: 0, rotate: initialRotate }
            : { y: 0, opacity: 1, rotate: restRotate }
        }
        animate={
          entry && !play
            ? { y: `-${entryDistance}%`, opacity: 0, rotate: initialRotate }
            : { y: 0, opacity: 1, rotate: restRotate }
        }
        transition={entryTransition}
        style={{
          width: "100%",
          height: "100%",
          borderRadius: pillRadius,
          backgroundColor: pill.background,
          display: "flex",
          alignItems: "center",
          paddingLeft: pillHeight * 0.45,
          paddingRight: pillHeight * 0.45,
          transformOrigin,
          boxShadow,
          willChange: "transform",
        }}
      >
        {!hideLabel && (
          <span
            style={{
              color: (pill as ParallaxPillItem).color,
              fontSize,
              fontWeight,
              letterSpacing: "-0.01em",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {(pill as ParallaxPillItem).label}
          </span>
        )}
      </motion.div>
    </motion.div>
  );
  void total;
};

const ParallaxPills: React.FC<ParallaxPillsProps> = ({
  pills = DEFAULT_PILLS,
  backgroundPills = DEFAULT_BG_PILLS,
  width = "100%",
  height = 480,
  className,
  pillRadius = 18,
  pillHeight = 64,
  fontSize = 18,
  fontWeight = 500,
  parallaxStrength = 24,
  disableParallax = false,
  disableEmptyPills = true,
  disableEntry = false,
  entryStagger = 0.08,
  entryStiffness = 140,
  entryDamping = 11,
  entryDistance = 220,
  parallaxStiffness = 60,
  parallaxDamping = 18,
  hingeChance = 0.5,
  hingeAngle = 18,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);

  useEffect(() => {
    if (disableParallax) return;
    const node = containerRef.current;
    if (!node) return;

    const handleMove = (e: PointerEvent) => {
      const rect = node.getBoundingClientRect();
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = ((e.clientY - rect.top) / rect.height) * 2 - 1;
      pointerX.set(nx);
      pointerY.set(ny);
    };
    const handleLeave = () => {
      pointerX.set(0);
      pointerY.set(0);
    };

    node.addEventListener("pointermove", handleMove);
    node.addEventListener("pointerleave", handleLeave);
    return () => {
      node.removeEventListener("pointermove", handleMove);
      node.removeEventListener("pointerleave", handleLeave);
    };
  }, [disableParallax, pointerX, pointerY]);

  const inView = useInView(containerRef, {
    once: true,
    margin: "0px 0px -10% 0px",
  });
  const entry = !disableEntry;
  const play = inView;

  return (
    <div
      ref={containerRef}
      className={cn("relative overflow-hidden", className)}
      style={{ width, height }}
    >
      {!disableEmptyPills &&
        backgroundPills.map((p, i) => (
        <Pill
          key={`bg-${i}`}
          pill={{ ...p, label: "", color: "transparent" }}
          index={i}
          total={backgroundPills.length}
          pillHeight={pillHeight}
          pillRadius={pillRadius}
          fontSize={fontSize}
          fontWeight={fontWeight}
          parallaxStrength={parallaxStrength}
          pointerX={pointerX}
          pointerY={pointerY}
          parallaxStiffness={parallaxStiffness}
          parallaxDamping={parallaxDamping}
          hingeChance={hingeChance}
          hingeAngle={hingeAngle}
          entry={entry}
          play={play}
          entryStagger={entryStagger}
          entryStiffness={entryStiffness}
          entryDamping={entryDamping}
          entryDistance={entryDistance}
          isBackground
          hideLabel
        />
      ))}
      {pills.map((p, i) => (
        <Pill
          key={`fg-${i}-${p.label}`}
          pill={p}
          index={i}
          total={pills.length}
          pillHeight={pillHeight}
          pillRadius={pillRadius}
          fontSize={fontSize}
          fontWeight={fontWeight}
          parallaxStrength={parallaxStrength}
          pointerX={pointerX}
          pointerY={pointerY}
          parallaxStiffness={parallaxStiffness}
          parallaxDamping={parallaxDamping}
          hingeChance={hingeChance}
          hingeAngle={hingeAngle}
          entry={entry}
          play={play}
          entryStagger={entryStagger}
          entryStiffness={entryStiffness}
          entryDamping={entryDamping}
          entryDistance={entryDistance}
        />
      ))}
    </div>
  );
};

ParallaxPills.displayName = "ParallaxPills";

export default ParallaxPills;
