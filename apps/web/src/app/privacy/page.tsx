import type { Metadata } from 'next';
import Link from 'next/link';
import LegalPage, { type LegalSection } from '@/components/v3/legal-page';

export const metadata: Metadata = {
  title: 'Privacy policy · TRADElogs',
  description: 'What TRADElogs collects, why, who it’s shared with, and your choices.',
};

const S: LegalSection[] = [
  { id: 'collect', title: 'What we collect', body: <>
    <p><b>Account details.</b> Your name, email address and password (stored as a one-way hash), or your Google profile name and email if you sign in with Google. At signup we also ask for your country, city and postal code.</p>
    <p><b>Broker connection.</b> For each MT5 account you connect: the broker, server, login number and <b>investor (read-only) password</b>. We need the investor password to keep syncing your history. It can only read the account — it can’t trade.</p>
    <p><b>Trading data.</b> The positions, deals, balances and statistics we import from MT5, and anything you add — journal entries, emotions, tags, notes, price alerts, watchlists, strategies and AI coach conversations.</p>
    <p><b>Usage and device data.</b> When you use the app we record your IP address and browser user-agent with your login session, and first-party usage events such as which pages you visit and how long you stay. We use these to secure accounts, fix problems and understand which features are used.</p>
    <p><b>Approximate location.</b> We convert the city and postal code you give us into approximate coordinates using OpenStreetMap’s Nominatim service. We don’t use your device’s GPS.</p>
    <p><b>Referrals.</b> If you arrive through a partner&rsquo;s link we record the visit — which link, the time, your device type, country, and a one-way hash of your IP address (never the address itself) — and remember it in a first-party cookie for up to 30 days. If you then sign up, or type a partner&rsquo;s code at signup, we record which partner referred you.</p>
    <p><b>Preferences.</b> Notification settings, time zone, and — if you turn on browser push — a push subscription from your browser.</p>
  </> },
  { id: 'use', title: 'How we use it', body: <>
    <ul>
      <li>to run TRADElogs: sync and analyse your trades, show your dashboard, journal and calendar, and send the alerts and emails you turn on;</li>
      <li>to answer your questions in the AI coach and to write reviews and analyses you ask for;</li>
      <li>to check access requirements, such as Elefin referral verification and trading activity;</li>
      <li>to keep the service secure, prevent abuse and fix bugs;</li>
      <li>to understand usage in aggregate and improve the product.</li>
    </ul>
    <p>We don’t sell your personal data and we don’t use it for third-party advertising.</p>
  </> },
  { id: 'sharing', title: 'Who we share it with', body: <>
    <p>We share data only with service providers that help us run TRADElogs, and only what each needs:</p>
    <ul>
      <li><b>Hosting and database</b> — Railway (app servers) and our managed PostgreSQL database provider store and process all account data.</li>
      <li><b>MT5 bridge</b> — a server we operate uses your login, server and investor password to read your account from your broker.</li>
      <li><b>AI providers</b> — when you use the AI coach, weekly review or similar features, the relevant parts of your trading data and your question are sent to our AI model provider (currently Groq or an OpenAI-compatible service), and web-search questions may go to a search provider such as Tavily.</li>
      <li><b>Email</b> — Resend delivers verification codes, digests and weekly reviews.</li>
      <li><b>Google</b> — if you choose “Continue with Google”.</li>
      <li><b>Browser push services</b> — your browser vendor’s push service delivers notifications if you enable them.</li>
      <li><b>The partner who referred you</b> — if you signed up through a partner&rsquo;s link or code, that partner can see your name, city, country, when you signed up, whether you&rsquo;ve connected a broker, and how actively you trade (your number of trades and lots in the last 30 days). They never see your email, balances, P&amp;L or individual trades. If you&rsquo;d rather not be linked to a partner, email us and we&rsquo;ll remove the link.</li>
      <li><b>Elefin</b> — to verify that your Elefin account was opened under our referral, we may share your email address and, if you provide it, your Elefin MT5 login.</li>
      <li><b>OpenStreetMap Nominatim</b> — receives the city and postal code you enter, to look up approximate coordinates.</li>
    </ul>
    <p>Market data, news and calendar providers receive the symbols we request, not your personal details. We may also disclose data if the law requires it, or to protect our users or the service.</p>
  </> },
  { id: 'security', title: 'How we protect it', body: <>
    <p>Access to production data is restricted to the services that need it and to a small number of authorised team members. Connections to TRADElogs use HTTPS, and passwords for your TRADElogs login are stored only as hashes.</p>
    <p>Your MT5 investor password is stored in our database so we can keep syncing; because it is read-only, it cannot be used to place trades or withdraw funds. No system is perfectly secure — if you suspect a problem, change your investor password at your broker and update it in <Link href="/brokers">Brokers</Link>.</p>
  </> },
  { id: 'retention', title: 'How long we keep it', body: <>
    <p>We keep your data while your account is open. Removing a broker account deletes the trades and deals synced from it. If you ask us to delete your account, we delete your personal data and trading data, except where we must keep limited records for legal, security or fraud-prevention reasons.</p>
  </> },
  { id: 'cookies', title: 'Cookies and local storage', body: <>
    <p>We use a first-party session cookie to keep you signed in, a first-party referral cookie (<code>tl_ref</code>, up to 30 days) when you arrive through a partner link, and your browser’s local storage for preferences such as chart layouts and the selected account. We don’t use third-party advertising or tracking cookies.</p>
  </> },
  { id: 'rights', title: 'Your choices and rights', body: <>
    <ul>
      <li><b>See and correct</b> your profile and location in <Link href="/settings">Settings</Link>.</li>
      <li><b>Export</b> your trades and deals as CSV from the <Link href="/trades">Trade log</Link>.</li>
      <li><b>Disconnect</b> any broker from <Link href="/brokers">Brokers</Link>.</li>
      <li><b>Turn off</b> emails, push and the weekly review in Settings, or with the unsubscribe link in any review email.</li>
      <li><b>Delete</b> your account, or ask for a copy of your data, by emailing <a href="mailto:hello@tradelogs.com">hello@tradelogs.com</a>.</li>
    </ul>
    <p>Depending on where you live — for example under India’s Digital Personal Data Protection Act or the GDPR — you may have further rights, such as objecting to processing or complaining to a data-protection authority. Contact us and we’ll help.</p>
  </> },
  { id: 'international', title: 'Where data is processed', body: <>
    <p>Our service providers may process data outside your country, including in the United States and the European Union. We use providers that apply appropriate safeguards to the data they handle for us.</p>
  </> },
  { id: 'children', title: 'Children', body: <>
    <p>TRADElogs is for adults. We don’t knowingly collect data from anyone under 18; if you think a child has signed up, tell us and we’ll delete the account.</p>
  </> },
  { id: 'changes', title: 'Changes to this policy', body: <>
    <p>If we change how we handle personal data in a significant way, we’ll tell you in the app or by email before the change applies.</p>
  </> },
  { id: 'contact', title: 'Contact', body: <>
    <p>For privacy questions or requests, email <a href="mailto:hello@tradelogs.com">hello@tradelogs.com</a>.</p>
  </> },
];

export default function PrivacyPage() {
  return (
    <LegalPage kicker="Legal" title="Privacy" accent="policy." updated="18 October 2026" sections={S}
      other={{ href: '/terms', label: 'Terms of service' }}
      intro={<p>We collect what we need to run your journal, we don’t sell it, and you can take it with you or ask us to delete it.</p>} />
  );
}
