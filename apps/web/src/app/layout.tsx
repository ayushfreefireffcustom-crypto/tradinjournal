import type { Metadata } from "next";
import { Sora } from "next/font/google";
import "./globals.css";

const sora = Sora({
  variable: "--font-sora",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "TradinX | Master Your Trading Psychology",
  description: "TradinX is the next-gen analytics layer for modern traders. Identify biases, review replays, and master the market.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${sora.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col font-sora bg-surface-container-lowest text-on-surface overflow-x-hidden">
        {children}
      </body>
    </html>
  );
}
