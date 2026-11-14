'use client';

// News: the story map (direction E). The day's scored stories as tiles sized by
// score, what is next on the calendar, what touches your trades, how the
// markets moved since the top story, and the wire. The full calendar and the
// classic feed stay on /markets.
import AppShell from '@/components/app-shell';
import NewsMapPage from '@/components/news/map/news-map-page';
import { useNow } from '@/components/news/map/bits';
import { useAccounts } from '@/lib/use-accounts';
import { hhmm } from '@/lib/news-map-api';
import type { BrokerAccount } from '@/lib/api';
import '@/styles/v6/markets.css';
import '@/styles/v6/news-map.css';

function dayLabel(now: number): string {
  return new Date(now).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).replace(',', '');
}

export default function NewsPage() {
  const { accounts, selected, select } = useAccounts();
  const now = useNow(30_000);
  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="News"
      pageSubtitle={<span className="nw-live" suppressHydrationWarning><i aria-hidden />Live · {dayLabel(now)} · {hhmm(now)} UTC</span>}
    >
      <NewsMapPage accountId={selected?.id ?? null} now={now} />
    </AppShell>
  );
}
