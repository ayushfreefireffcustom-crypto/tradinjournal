import type { Metadata } from 'next';
import '@/components/landing-v5/landing.css';
import Nav, { Announcement } from '@/components/landing-v5/nav';
import Hero from '@/components/landing-v5/hero';
import DeletedNote from '@/components/landing-v6/deleted-note';
import { PARTNERS_ENABLED } from '@/lib/features';
import { Ai, Behaviour, Core, Cta, Facts, Faq, Footer, Partners, Review, Security, Steps } from '@/components/landing-v5/sections';
import { Copy, Markets, Options, Strategies } from '@/components/landing-v5/features';


import { SITE_DESCRIPTION, SITE_OG_IMAGE, SITE_TITLE, SITE_URL } from '@/lib/site-meta';

export const metadata: Metadata = {
  title: SITE_TITLE,
  description: SITE_DESCRIPTION,
  alternates: { canonical: SITE_URL },
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    siteName: 'TRADElogs',
    images: [SITE_OG_IMAGE],
    type: 'website',
  },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION, images: [SITE_OG_IMAGE.url] },
};

export const viewport = { themeColor: '#030303' };

export default function LandingPage() {
  return (
    <div className="lp5">
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
