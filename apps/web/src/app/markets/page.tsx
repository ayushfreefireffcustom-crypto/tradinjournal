'use client';

// Markets — the unified live desk: the Market-News feed and the Economic
// Calendar on one page. Two-pane on desktop (news is the main column, the
// calendar is a vertical right rail); on mobile a [Feed | Calendar] toggle
// swaps the single column between them.
import { useState } from 'react';
import { Newspaper, CalendarDots } from '@phosphor-icons/react';
import AppShell from '@/components/app-shell';
import NewsFeed from '@/components/news/news-feed';
import CalendarRail from '@/components/calendar/calendar-rail';
import { useAccounts } from '@/lib/use-accounts';
import { useTradedSymbols } from '@/lib/use-traded-symbols';
import type { BrokerAccount } from '@/lib/api';

type MobileTab = 'feed' | 'calendar';

export default function MarketsPage() {
  const { accounts, selected, select } = useAccounts();
  const userSymbols = useTradedSymbols(selected?.id);
  const [tab, setTab] = useState<MobileTab>('feed');

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="Markets"
      pageSubtitle="// LIVE DESK"
    >
      <div className="flex flex-col h-full min-h-0" data-testid="markets-page">
        {/* Mobile-only tab switch (desktop shows both panes at once). */}
        <div className="lg:hidden shrink-0 border-b border-border-soft px-3 py-2 flex items-center gap-1.5">
          {([['feed', 'News', Newspaper], ['calendar', 'Calendar', CalendarDots]] as const).map(([t, label, Icon]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              data-testid={`markets-tab-${t}`}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-[11px] tracking-[0.12em] uppercase rounded-[var(--radius-btn)] border transition-colors ${
                tab === t ? 'bg-profit/15 text-fg border-profit/30' : 'text-fg-3 border-border-soft hover:text-fg'
              }`}
            >
              <Icon size={13} weight="bold" /> {label}
            </button>
          ))}
        </div>

        <div className="flex-1 min-h-0 flex">
          {/* News feed — main column. Hidden on mobile when the Calendar tab is active.
              flex-col so the h-full NewsFeed stretches to the full pane width. */}
          <div className={`flex-1 min-w-0 min-h-0 flex-col ${tab === 'feed' ? 'flex' : 'hidden'} lg:flex`}>
            <NewsFeed userSymbols={userSymbols} />
          </div>

          {/* Calendar — right rail on desktop; full column on mobile Calendar tab. */}
          <aside
            className={`min-h-0 w-full lg:w-[340px] xl:w-[380px] lg:shrink-0 border-l border-border-soft flex-col ${
              tab === 'calendar' ? 'flex' : 'hidden'
            } lg:flex`}
          >
            <CalendarRail />
          </aside>
        </div>
      </div>
    </AppShell>
  );
}
