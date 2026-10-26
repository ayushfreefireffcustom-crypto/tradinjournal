import type { Metadata } from 'next';
import { Inter, Instrument_Serif, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import ClickBurstEffect from '@/components/click-burst-effect';
import CursorGlow from '@/components/cursor-glow';
import { ToastProvider } from '@/components/toast';

// Inter is the sole brand typeface (Black 900 for display/logo, Bold 700 for
// headings, SemiBold 600 for UI labels, Regular 400 for body). Self-hosted via
// next/font, so there's no external request and no flash-of-unstyled-text.
const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800', '900'],
  variable: '--font-inter',
  display: 'swap',
});

// v5 premium theme: a serif italic for the one accent word per heading, and a
// mono for prices/tables. Self-hosted by next/font like Inter.
const serif = Instrument_Serif({ subsets: ['latin'], weight: '400', style: ['normal', 'italic'], variable: '--font-v5-serif', display: 'swap' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500'], variable: '--font-v5-mono', display: 'swap' });

export const metadata: Metadata = {
  title: 'TRADElogs // Tactical Trade Journal',
  description: 'Behavioural analytics & trade journaling for MT5 forex traders. Read your edge in raw, technical clarity.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${inter.variable} ${serif.variable} ${mono.variable}`}>
      <head>
        {/* Satoshi — the v3 product typeface (Fontshare, free for commercial use). */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
        <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,400i,500i&display=swap" />
      </head>
      <body className="min-h-screen bg-app text-fg antialiased">
        <ClickBurstEffect />
        <CursorGlow />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
