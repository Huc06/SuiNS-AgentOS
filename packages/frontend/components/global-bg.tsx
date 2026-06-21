"use client";

import dynamic from "next/dynamic";

const LiquidAscii = dynamic(
  () => import("@/components/react-bits/liquid-ascii"),
  { ssr: false },
);

export function GlobalBg() {
  return (
    <div className="pointer-events-none fixed inset-0 z-0 h-screen w-screen">
      <LiquidAscii
        width="100vw"
        height="100vh"
        speed={0.5}
        cellSize={14}
        gravity={-15}
        fillHeight={0.4}
        color="#3c549a"
        backgroundColor="transparent"
        characters="·:-~=+*#%@"
        opacity={0.28}
        cursorRadius={0.2}
        cursorForce={40}
        autoWave
      />
    </div>
  );
}
