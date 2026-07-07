import type { Metadata } from 'next';
import { JetBrains_Mono } from 'next/font/google';
import './globals.css';

// JetBrains Mono is the body/number font (the bulk of the UI). Self-hosting it
// via next/font removes the flash-of-unstyled-text and layout shift that the
// old CDN <link> caused, which was the main source of font inconsistency.
const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-mono-jb',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'TradinX // Tactical Trade Journal',
  description: 'Behavioural analytics & trade journaling for MT5 forex traders. Read your edge in raw, technical clarity.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`dark ${jetbrainsMono.variable}`}>
      <head>
        {/* Cabinet Grotesk (display headings) — Fontshare has no npm/Google
            equivalent at weight 900, so it stays on the CDN. */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800,900&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-app text-fg font-mono antialiased">{children}</body>
    </html>
  );
}
