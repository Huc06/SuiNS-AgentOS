"use client";

import type { ReactNode } from "react";
import ElectricBorder from "../../../components/ui/electric-border";

export function PortfolioBorder({ children }: { children: ReactNode }) {
  return (
    <ElectricBorder color="#3B82F6" speed={0.8} chaos={0.08} borderRadius={12}>
      {children}
    </ElectricBorder>
  );
}
