import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TradinX // Tactical Trade Journal',
  description: 'Behavioural analytics & trade journaling for MT5 forex traders. Read your edge in raw, technical clarity.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="dark">
      <head>
        {/* Cabinet Grotesk (Fontshare) + JetBrains Mono (Google) */}
        <link rel="preconnect" href="https://api.fontshare.com" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          href="https://api.fontshare.com/v2/css?f[]=cabinet-grotesk@500,700,800,900&display=swap"
          rel="stylesheet"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-app text-fg font-mono antialiased">{children}</body>
    </html>
  );
}
