import type { Metadata } from 'next';
import '@/components/landing-v3/landing.css';
import Nav from '@/components/landing-v3/nav';
import Hero from '@/components/landing-v3/hero';
import { Core, Cta, Faq, Footer, Leak, Platform, Review, Steps } from '@/components/landing-v3/sections';

export const metadata: Metadata = {
  title: 'TRADElogs — The trading journal that tells you what to fix',
  description:
    'Connect MetaTrader 5 with a read-only login. TRADElogs journals every fill, measures every habit, and every Monday tells you the one thing to fix.',
  openGraph: {
    title: 'TRADElogs — Your trades know. Now you will too.',
    description: 'The MT5 trading journal with a behaviour engine and a weekly review that tells you the one thing to fix.',
    url: 'https://www.tradelogs.com',
    siteName: 'TRADElogs',
    images: [{ url: '/landing/dashboard.jpg', width: 1720, height: 1075, alt: 'TRADElogs dashboard' }],
    type: 'website',
  },
};

export default function LandingPage() {
  return (
    <div className="lp">
      {/* Satoshi (Fontshare, free for commercial use). Hoisted to <head> by React 19. */}
      <link rel="preconnect" href="https://api.fontshare.com" />
      <link rel="preconnect" href="https://cdn.fontshare.com" crossOrigin="" />
      <link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]=satoshi@400,500,700,400i,500i&display=swap" precedence="default" />

      <a href="#main" className="lp-skip">Skip to content</a>
      <Nav />
      <main id="main">
        <Hero />
        <Core />
        <Platform />
        <Leak />
        <Review />
        <Steps />
        <Faq />
        <Cta />
      </main>
      <Footer />
    </div>
  );
}
