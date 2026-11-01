import type { MetadataRoute } from 'next';

// PWA (H14): installable from the browser, opening straight into the app.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'TRADElogs',
    short_name: 'TRADElogs',
    description: 'Trading journal, strategies and copy trading.',
    id: '/dashboard',
    start_url: '/dashboard?source=pwa',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#0A0A0A',
    theme_color: '#0A0A0A',
    categories: ['finance', 'productivity'],
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Dashboard', url: '/dashboard', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'Positions', url: '/trading', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
      { name: 'AI coach', url: '/coach', icons: [{ src: '/icon-192.png', sizes: '192x192' }] },
    ],
  };
}
