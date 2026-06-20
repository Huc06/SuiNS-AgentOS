import type { Metadata } from "next";
import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

import "@mysten/dapp-kit/dist/index.css";

import { AppSidebar } from "../components/app-sidebar";
import { Providers } from "./providers";
import "./globals.css";

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL || "https://suins-agentos.vercel.app",
  ),
  title: "SuiNS AgentOS — Discoverable agents on Sui",
  description:
    "Sui-native identity, wallet, skill discovery, and delegation for AI agents. Resolve by SuiNS name.",
  openGraph: {
    title: "SuiNS AgentOS",
    description: "ENS for AI Agents — identity, skills, and delegation on Sui.",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "SuiNS AgentOS",
    description: "ENS for AI Agents — identity, skills, and delegation on Sui.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body className="font-mono">
        <a href="#main-content" className="skip-to-content">
          Skip to content
        </a>
        <Providers>
          <div className="flex min-h-screen">
            <AppSidebar />
            <div id="main-content" className="ml-16 flex-1 md:ml-56">
              {children}
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
