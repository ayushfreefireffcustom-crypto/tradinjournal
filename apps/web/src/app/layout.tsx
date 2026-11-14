import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import ClickBurstEffect from '@/components/click-burst-effect';
import CursorGlow from '@/components/cursor-glow';
import { ToastProvider } from '@/components/toast';
import PwaSetup from '@/components/pwa-setup';
import { SITE_DESCRIPTION, SITE_OG_IMAGE, SITE_TITLE, SITE_URL } from '@/lib/site-meta';

// Type (E2, 2 Nov 2026): Inter for everything, numbers with tabular figures.
// Self-hosted by next/font; the weights the app and landing use.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-inter', display: 'swap' });

const THEME_SCRIPT = `(function(){var t='dark';try{var q=new URLSearchParams(location.search).get('theme');var s=localStorage.getItem('tl-theme');t=q==='light'||q==='dark'?q:s==='light'?'light':'dark';}catch(e){}document.documentElement.dataset.theme=t;try{if(localStorage.getItem('tl-hide-money')==='1')document.documentElement.dataset.hideMoney='1'}catch(e){}})();`;

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  openGraph: { type: 'website', siteName: 'TRADElogs', title: SITE_TITLE, description: SITE_DESCRIPTION, url: SITE_URL, images: [SITE_OG_IMAGE] },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION, images: [SITE_OG_IMAGE.url] },
  // Installable app (H14).
  applicationName: 'TRADElogs',
  appleWebApp: { capable: true, title: 'TRADElogs', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/favicon.ico' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`} suppressHydrationWarning>
      <head>
        {/* v6 theme before first paint: ?theme= wins, then the saved choice, else dark. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-screen bg-app text-fg antialiased">
        <ClickBurstEffect />
        <CursorGlow />
        <ToastProvider>{children}</ToastProvider>
        <PwaSetup />
      </body>
    </html>
  );
}
