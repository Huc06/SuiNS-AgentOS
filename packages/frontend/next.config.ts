import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@agentos/sdk"],
  // Include the seed registry file in serverless function bundles
  outputFileTracingIncludes: {
    "/**": ["./registry.seed.json"],
  },
  async redirects() {
    return [
      { source: "/dashboard", destination: "/create", permanent: false },
      { source: "/dashboard/:path*", destination: "/create", permanent: false },
    ];
  },
};

export default nextConfig;
