import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';
import ClickBurstEffect from '@/components/click-burst-effect';
import CursorGlow from '@/components/cursor-glow';
import { ToastProvider } from '@/components/toast';
import PwaSetup from '@/components/pwa-setup';

// Type (A0.14–A0.16): Satoshi 400/500 for all text (Fontshare stylesheet below)
// and JetBrains Mono 400/500 for numbers, self-hosted by next/font.
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-v5-mono', display: 'swap' });

const THEME_SCRIPT = `(function(){var t='dark';try{var q=new URLSearchParams(location.search).get('theme');var s=localStorage.getItem('tl-theme');t=q==='light'||q==='dark'?q:s==='light'?'light':'dark';}catch(e){}document.documentElement.dataset.theme=t;try{if(localStorage.getItem('tl-hide-money')==='1')document.documentElement.dataset.hideMoney='1'}catch(e){}})();`;

export const metadata: Metadata = {
  title: 'TRADElogs // Tactical Trade Journal',
  description: 'Behavioural analytics & trade journaling for MT5 forex traders. Read your edge in raw, technical clarity.',
  // Installable app (H14).
  applicationName: 'TRADElogs',
  appleWebApp: { capable: true, title: 'TRADElogs', statusBarStyle: 'black-translucent' },
  icons: { icon: [{ url: '/favicon.ico' }, { url: '/icon-192.png', sizes: '192x192', type: 'image/png' }], apple: [{ url: '/apple-touch-icon.png', sizes: '180x180' }] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${mono.variable}`} suppressHydrationWarning>
      <head>
        {/* v6 theme before first paint: ?theme= wins, then the saved choice, else dark. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
        {/* Satoshi, the product typeface (Fontshare, free for commercial use). Only the two weights the UI uses. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500&display=swap" />
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
