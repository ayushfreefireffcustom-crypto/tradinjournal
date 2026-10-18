import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { type LegalSection } from '@/components/v3/legal-page';

export const metadata: Metadata = {
  title: 'Terms of service · TRADElogs',
  description: 'The rules for using TRADElogs, the read-only MT5 trading journal.',
};

const S: LegalSection[] = [
  { id: 'agreement', title: 'Agreeing to these terms', body: <>
    <p>These terms govern your use of TRADElogs — the website at tradelogs.com, the web app, and the emails and notifications it sends (together, “the service”). By creating an account or using the service you agree to them. If you don’t agree, please don’t use TRADElogs.</p>
    <p>You must be at least 18 years old and able to enter a binding agreement where you live.</p>
  </> },
  { id: 'service', title: 'What TRADElogs does', body: <>
    <p>TRADElogs is a trading journal. It connects to your MetaTrader 5 account with <b>read-only investor credentials</b>, imports your trade history, and gives you analytics, a journal, a calendar, chart replays, an AI coach, market news, an economic calendar and analysis tools such as SignalX and the macro dashboard.</p>
    <p>Investor credentials can only read an MT5 account. <b>TRADElogs cannot place, modify or close trades, and never moves funds.</b></p>
  </> },
  { id: 'not-advice', title: 'Not investment advice', body: <>
    <p>Everything in TRADElogs — including statistics, insights, coach replies, weekly reviews, SignalX analyses, macro scores, news tags and alerts — is <b>for information and education only</b>. It is not investment, financial, tax or legal advice, and it is not a recommendation to buy or sell anything.</p>
    <p>TRADElogs is not registered with SEBI or any other regulator as an investment adviser or research analyst. Trading forex, CFDs and crypto carries a high risk of loss, and past performance does not predict future results. You are solely responsible for your trading decisions.</p>
    <p>Some features use AI models. AI output can be wrong, incomplete or out of date — check anything that matters before acting on it.</p>
  </> },
  { id: 'account', title: 'Your account', body: <>
    <p>Keep your login details secure and tell us at <a href="mailto:hello@tradelogs.com">hello@tradelogs.com</a> if you think your account has been accessed without permission. You are responsible for activity on your account.</p>
    <p>Give accurate information when you sign up, including your location. You may connect up to two MT5 accounts, and you must only connect accounts you own or are authorised to use.</p>
  </> },
  { id: 'access', title: 'Access requirements', body: <>
    <p>Full access to TRADElogs may require a verified Elefin account opened under our referral and a minimum level of recent trading activity. The current requirement is shown on the access screen in the app. If you stop meeting it, some or all of the app may be unavailable until you do.</p>
    <p>We may change these requirements, and we may grant or remove access manually, for example for testing or support.</p>
  </> },
  { id: 'pricing', title: 'Price', body: <>
    <p>TRADElogs is currently free. If we introduce paid plans, we’ll tell you before anything is charged, and paid features will only apply if you choose to subscribe.</p>
  </> },
  { id: 'acceptable-use', title: 'Acceptable use', body: <>
    <p>Don’t misuse the service. In particular, don’t:</p>
    <ul>
      <li>try to access accounts, data or systems that aren’t yours;</li>
      <li>scrape, overload or reverse-engineer the service, or get around rate limits or access controls;</li>
      <li>use TRADElogs to break any law, including financial-promotion and anti-fraud rules;</li>
      <li>resell or publicly redistribute the service, its market data or its AI output without our permission;</li>
      <li>upload anything unlawful, harmful or that you don’t have the right to share.</li>
    </ul>
  </> },
  { id: 'content', title: 'Your content and data', body: <>
    <p>Your trade history, journal entries, tags, notes and coach conversations remain yours. You give us permission to store and process them only to run, secure and improve the service for you, as described in our <Link href="/privacy">Privacy policy</Link>.</p>
    <p>Removing a broker account from TRADElogs disconnects it and deletes its synced data from your journal.</p>
  </> },
  { id: 'third-party', title: 'Third-party data and services', body: <>
    <p>TRADElogs shows data from third parties — your broker’s MT5 server, market-data and news providers, and economic-calendar sources. We don’t control them and can’t guarantee that their data is accurate, complete or on time. Prices, P&amp;L and statistics in TRADElogs may differ from your broker’s official statements; your broker’s records always take precedence.</p>
  </> },
  { id: 'availability', title: 'Availability and changes', body: <>
    <p>We work to keep TRADElogs running, but we don’t promise it will be uninterrupted or error-free. Syncing depends on your broker and on our MT5 bridge, and we may take the service down for maintenance. We may add, change or remove features at any time.</p>
  </> },
  { id: 'ending', title: 'Ending your use', body: <>
    <p>You can stop using TRADElogs at any time, and you can ask us to delete your account by emailing <a href="mailto:hello@tradelogs.com">hello@tradelogs.com</a>. We may suspend or close an account that breaks these terms or puts the service or other users at risk.</p>
  </> },
  { id: 'liability', title: 'Disclaimers and liability', body: <>
    <p>The service is provided “as is” and “as available”, without warranties of any kind to the extent the law allows. TRADElogs is not liable for trading losses, missed opportunities, or decisions you make based on anything shown in the service.</p>
    <p>To the extent the law allows, our total liability for any claim relating to the service is limited to the amount you paid us in the 12 months before the claim — which, while TRADElogs is free, is zero. Nothing in these terms limits liability that cannot be limited by law.</p>
  </> },
  { id: 'changes', title: 'Changes to these terms', body: <>
    <p>We may update these terms. If a change is significant we’ll tell you in the app or by email before it takes effect. Continuing to use TRADElogs after that means you accept the updated terms.</p>
  </> },
  { id: 'contact', title: 'Contact', body: <>
    <p>Questions about these terms? Email <a href="mailto:hello@tradelogs.com">hello@tradelogs.com</a>.</p>
  </> },
];

export default function TermsPage() {
  return (
    <LegalPage kicker="Legal" title="Terms of" accent="service." updated="18 October 2026" sections={S}
      other={{ href: '/privacy', label: 'Privacy policy' }}
      intro={<p>The short version: TRADElogs is a <b>read-only</b> journal for your MT5 trades. It can’t trade for you, it isn’t investment advice, and your data stays yours.</p>} />
  );
}
