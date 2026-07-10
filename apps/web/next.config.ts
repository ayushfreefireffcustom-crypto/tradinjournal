import type { NextConfig } from 'next';
import path from 'path';

const config: NextConfig = {
  reactStrictMode: true,
  outputFileTracingRoot: path.join(__dirname, '../../'),
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  // Allow the Emergent preview host to talk to dev server
  allowedDevOrigins: ['*.preview.emergentagent.com', '*.emergentagent.com', '*.emergentcf.cloud', '*.preview.emergentcf.cloud', '*'],
  // Proxy /api/* to the Express API server-side so the browser only ever talks to
  // this app's own origin. Web and API deploy to different up.railway.app
  // subdomains (different sites per the public suffix list), and Safari blocks
  // cross-site auth cookies even with SameSite=None — routing through this proxy
  // makes the session cookie first-party instead.
  async rewrites() {
    const apiOrigin = process.env.API_ORIGIN;
    if (!apiOrigin) return [];
    return [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }];
  },
};

export default config;
