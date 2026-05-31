import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@agentos/sdk'],
  async redirects() {
    return [
      { source: '/dashboard', destination: '/create', permanent: false },
      { source: '/dashboard/:path*', destination: '/create', permanent: false },
    ];
  },
};

export default nextConfig;
