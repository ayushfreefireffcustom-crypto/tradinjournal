import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import '@/components/landing-v5/landing.css';
import Nav, { Announcement } from '@/components/landing-v5/nav';
import Hero from '@/components/landing-v5/hero';
import DeletedNote from '@/components/landing-v6/deleted-note';
import { PARTNERS_ENABLED } from '@/lib/features';
import { Ai, Behaviour, Core, Cta, Facts, Faq, Footer, Partners, Review, Security, Steps } from '@/components/landing-v5/sections';
import { Copy, Markets, Options, Strategies } from '@/components/landing-v5/features';

// The landing uses the approved E2 type: Inter only. Loaded here so the app
// pages, which use Satoshi, don't download it.
const inter = Inter({ subsets: ['latin'], weight: ['400', '500', '600', '700', '800', '900'], variable: '--font-l5', display: 'swap' });

export const metadata: Metadata = {
  title: 'TRADElogs — The trading journal that tells you what to fix',
  description:
    'Connect MetaTrader 5 with a read-only login. TRADElogs journals every fill, measures every habit, and every Saturday tells you the one thing to fix.',
  openGraph: {
    title: 'TRADElogs — Your trades know. Now you will too.',
    description: 'The MT5 trading journal with a behaviour engine, an AI coach and a weekly review that tells you the one thing to fix.',
    url: 'https://www.tradelogs.com',
    siteName: 'TRADElogs',
    images: [{ url: '/landing/dashboard-v5.jpg', width: 2160, height: 1350, alt: 'TRADElogs dashboard' }],
    type: 'website',
  },
};

export const viewport = { themeColor: '#030303' };

export default function LandingPage() {
  return (
    <div className={`lp5 ${inter.variable}`}>
      <a href="#main" className="l5-skip">Skip to content</a>
      <div className="l5-grain" aria-hidden />
      <DeletedNote />
      <Announcement />
      <Nav />
      <main id="main">
        <Hero />
        <Facts />
        <Core />
        <Behaviour />
        <Ai />
        <Review />
        <Markets />
        <Strategies />
        <Options />
        <Copy />
        <Security />
        <Steps />
        {PARTNERS_ENABLED && <Partners />}
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
