'use client';

import AppShell from '@/components/app-shell';
import MacroCompliance from '@/components/macro/macro-compliance';
import TraderMaster from '@/components/trader/trader-master';

export default function TraderPage() {
  return (
    <AppShell pageTitle="Trader Master" pageSubtitle="// AI TRADE ANALYSIS">
      <div className="flex flex-col h-full min-h-0" data-testid="trader-page">
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4">
          <div className="mx-auto w-full max-w-2xl">
            <div className="mb-3">
              <div className="text-[10px] tracking-[0.2em] text-fg-3">// TRADER MASTER</div>
              <p className="text-[12px] text-fg-3 mt-1 leading-relaxed">
                A markets-trained read of any instrument: pick a symbol and timeframe(s) and get a structured
                analysis — direction, entry zone, stop-loss and three targets from live price structure. Free.
              </p>
            </div>
            <TraderMaster />
          </div>
        </div>
        <MacroCompliance />
      </div>
    </AppShell>
  );
}
