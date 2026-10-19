import type { NextConfig } from 'next';
import path from 'path';

const config: NextConfig = {
  reactStrictMode: true,
  // Lets a second dev server (e.g. mock mode) build into its own folder — two
  // `next dev` processes sharing .next serve each other's compiled pages.
  distDir: process.env.NEXT_DIST_DIR || '.next',
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
    if (!apiOrigin) return { beforeFiles: [], afterFiles: [], fallback: [] };
    return {
      // Partner referral links (tradelogs.com/r/CODE) are answered by the API, which
      // records the click and sets the first-party tl_ref cookie on this origin.
      // beforeFiles so it wins over the mock-mode fallback page at app/r/[code].
      beforeFiles: [{ source: '/r/:code', destination: `${apiOrigin}/api/r/:code` }],
      afterFiles: [{ source: '/api/:path*', destination: `${apiOrigin}/api/:path*` }],
      fallback: [],
    };
  },
};

export default config;
