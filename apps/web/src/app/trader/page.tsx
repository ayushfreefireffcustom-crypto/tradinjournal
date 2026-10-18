'use client';

import AppShell from '@/components/app-shell';
import MacroCompliance from '@/components/macro/macro-compliance';
import TraderMaster from '@/components/trader/trader-master';
import TrackRecordPanel from '@/components/trader/track-record';
import StrategyBuilder from '@/components/trader/strategy-builder';
import { useAccounts } from '@/lib/use-accounts';
import type { BrokerAccount } from '@/lib/api';

export default function TraderPage() {
  const { accounts, selected, select } = useAccounts();
  return (
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)} pageTitle="SignalX">
      <div className="v3-page" data-testid="trader-page">
        <header>
          <h1 className="v3-h1 t-h1"><b>Signal<em className="sx-x">X</em></b></h1>
          <p className="v3-sub" style={{ fontSize: 15.5 }}>Direction, levels, and graded outcomes.</p>
        </header>
        <div className="sx-grid">
          <div className="sx-main"><TraderMaster /></div>
          <aside className="sx-side">
            <TrackRecordPanel scope="all" />
            <StrategyBuilder />
          </aside>
        </div>
        <div className="sx-legal"><MacroCompliance /></div>
      </div>
    </AppShell>
  );
}
