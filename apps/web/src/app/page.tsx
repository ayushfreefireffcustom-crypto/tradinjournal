import type { Metadata } from 'next';
import '@/components/landing-v6/landing-v6.css';
import { IconSprite } from '@/components/landing-v6/icons';
import DeletedNote from '@/components/landing-v6/deleted-note';
import { Closing, FaqSection, Features, Footer, Hero, How, Integrations, Nav, Next } from '@/components/landing-v6/sections';

export const metadata: Metadata = {
  title: 'TRADElogs — The complete trading journal',
  description:
    'Connect MetaTrader 5 with a read-only login. TRADElogs journals every fill, measures every habit, tells you the one thing to fix each Saturday, and lets you backtest your rules as a no-code strategy.',
  openGraph: {
    title: 'TRADElogs — The complete trading journal',
    description: 'The MT5 trading journal with a behaviour engine, an AI coach and a weekly review that tells you the one thing to fix.',
    url: 'https://www.tradelogs.com',
    siteName: 'TRADElogs',
    images: [{ url: '/landing/dashboard-v6.jpg', width: 2160, height: 1350, alt: 'TRADElogs dashboard' }],
    type: 'website',
  },
};

export const viewport = { themeColor: '#0B0B0C' };

export default function LandingPage() {
  return (
    <div className="lp6">
      <a href="#main" className="skip">Skip to content</a>
      <IconSprite />
      <DeletedNote />
      <Nav />
      <main id="main">
        <Hero />
        <div className="wrap">
          <Features />
          <How />
          <Next />
          <Integrations />
          <FaqSection />
          <Closing />
        </div>
      </main>
      <Footer />
    </div>
  );
}
