import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
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

export const metadata: Metadata = {
  title: 'TRADElogs // Tactical Trade Journal',
  description: 'Behavioural analytics & trade journaling for MT5 forex traders. Read your edge in raw, technical clarity.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${inter.variable}`}>
      <body className="min-h-screen bg-app text-fg antialiased">
        <ClickBurstEffect />
        <CursorGlow />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
