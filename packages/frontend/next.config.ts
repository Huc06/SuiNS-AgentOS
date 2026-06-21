import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";

// Make the single repo-root `.env` reach every server route. `next dev/build/
// start` run with cwd = packages/frontend and Next only auto-loads `.env*` from
// THAT directory, so the user's repo-root secrets (SUI_PRIVATE_KEY,
// ENOKI_SECRET_KEY, MEMWAL_*, NEXT_PUBLIC_*) would otherwise be invisible to the
// run/sponsor routes. This runs in the parent Node process before any route is
// evaluated; `override: false` lets a real packages/frontend/.env still win, and
// it is inert on Vercel (no root .env — platform env vars are used instead).
// NEVER logs values.
const rootEnv = resolve(process.cwd(), "../../.env");
if (existsSync(rootEnv)) {
  loadDotenv({ path: rootEnv, override: false });
}

const nextConfig: NextConfig = {
  transpilePackages: ["@agentos/sdk"],
  // Include the seed registry + demo runs files in serverless function bundles
  // so a cold/ephemeral filesystem still seeds the registry and Analytics data.
  outputFileTracingIncludes: {
    "/**": ["./registry.seed.json", "./lib/runs.seed.json"],
  },
  async redirects() {
    return [
      { source: "/dashboard", destination: "/create", permanent: false },
      { source: "/dashboard/:path*", destination: "/create", permanent: false },
    ];
  },
};

export default nextConfig;
