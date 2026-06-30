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
};

export default config;
