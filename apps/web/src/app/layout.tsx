import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'TradingJournal',
  description: 'Your MT5 trading journal',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
