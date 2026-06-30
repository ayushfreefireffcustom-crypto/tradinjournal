import type { Metadata } from 'next';
import { Sora } from 'next/font/google';
import './globals.css';

const sora = Sora({
  variable: '--font-sora',
  subsets: ['latin'],
});

export const metadata: Metadata = {
  title: 'TradinX | Master Your Trading Psychology',
  description: 'TradinX is the next-gen analytics layer for modern traders. Identify biases, review replays, and master the market.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} dark`}>
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className={`${sora.className} antialiased`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
