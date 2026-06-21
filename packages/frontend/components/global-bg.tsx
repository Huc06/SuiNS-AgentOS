"use client";

import dynamic from "next/dynamic";

const LiquidAscii = dynamic(
  () => import("@/components/react-bits/liquid-ascii"),
  { ssr: false },
);

export function GlobalBg() {
  return (
    <div className="pointer-events-none fixed inset-0 z-[9999] h-screen w-screen">
      <LiquidAscii
        width="100%"
        height="100%"
        speed={0.5}
        cellSize={14}
        gravity={-15}
        fillHeight={0.9}
        color="#000000"
        backgroundColor="transparent"
        characters="·:-~=+*#%@"
        opacity={0.12}
        cursorRadius={0.2}
        cursorForce={40}
        autoWave
      />
    </div>
  );
}
