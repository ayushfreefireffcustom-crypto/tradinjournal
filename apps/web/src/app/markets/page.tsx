'use client';

// Markets — the unified live desk: the Market-News feed and the Economic
// Calendar on one page. Two-pane on desktop (news is the main column, the
// calendar is a vertical right rail); on mobile a [Feed | Calendar] toggle
// swaps the single column between them.
import { useState } from 'react';
import AppShell from '@/components/app-shell';
import NewsFeed from '@/components/news/news-feed';
import CalendarRail from '@/components/calendar/calendar-rail';
import { useAccounts } from '@/lib/use-accounts';
import { useTradedSymbols } from '@/lib/use-traded-symbols';
import type { BrokerAccount } from '@/lib/api';

type MobileTab = 'feed' | 'calendar';

export default function MarketsPage() {
  const { accounts, selected, select } = useAccounts();
  const { symbols: userSymbols, ready: symbolsReady } = useTradedSymbols(selected?.id);
  const [tab, setTab] = useState<MobileTab>('feed');

  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)} pageTitle="Markets">
      <div className="mk-page" data-testid="markets-page">
        <div className="v3-seg mk-tabs" role="tablist" aria-label="View">
          <button role="tab" aria-selected={tab === 'feed'} aria-pressed={tab === 'feed'} onClick={() => setTab('feed')} data-testid="markets-tab-feed">News</button>
          <button role="tab" aria-selected={tab === 'calendar'} aria-pressed={tab === 'calendar'} onClick={() => setTab('calendar')} data-testid="markets-tab-calendar">Calendar</button>
        </div>
        <div className={`mk-col ${tab === 'feed' ? 'on' : ''}`}><NewsFeed userSymbols={userSymbols} symbolsReady={symbolsReady} /></div>
        <aside className={`mk-rail ${tab === 'calendar' ? 'on' : ''}`}><CalendarRail /></aside>
      </div>
    </AppShell>
  );
}
