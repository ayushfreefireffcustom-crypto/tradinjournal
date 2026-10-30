'use client';

import AppShell from '@/components/app-shell';
import TraderMaster from '@/components/trader/trader-master';
import TrackRecordPanel from '@/components/trader/track-record';
import StrategyBuilder from '@/components/trader/strategy-builder';
import { SignalDisclaimer } from '@/components/v6/ai/bits';
import { useAccounts } from '@/lib/use-accounts';
import type { BrokerAccount } from '@/lib/api';

export default function TraderPage() {
  const { accounts, selected, select } = useAccounts();
  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="SignalX" pageSubtitle="Direction, levels and graded outcomes for any symbol">
      <div className="x-page" data-testid="trader-page">
        <div className="ai-sx">
          <TraderMaster />
          <aside className="ai-col ai-side">
            <TrackRecordPanel scope="all" />
            <StrategyBuilder />
          </aside>
        </div>
        <SignalDisclaimer />
      </div>
    </AppShell>
  );
}
