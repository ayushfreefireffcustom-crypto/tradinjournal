'use client';

import AppShell from '@/components/app-shell';
import MacroCompliance from '@/components/macro/macro-compliance';
import TraderMaster from '@/components/trader/trader-master';
import TrackRecordPanel from '@/components/trader/track-record';
import StrategyBuilder from '@/components/trader/strategy-builder';

export default function TraderPage() {
  return (
    <AppShell pageTitle="SignalX" pageSubtitle="// AI TRADE ANALYSIS">
      <div className="flex flex-col h-full min-h-0" data-testid="trader-page">
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto w-full max-w-6xl">
            <header className="mb-5 animate-[fade-up_0.35s_ease_both]">
              <h1 className="font-display font-semibold text-xl sm:text-2xl tracking-tight text-fg">
                SignalX
              </h1>
              <p className="mt-1 text-sm text-fg-2">Direction, levels, and graded outcomes.</p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-5 items-start">
              <div className="lg:col-span-3 min-w-0">
                <TraderMaster />
              </div>
              <div className="lg:col-span-2 min-w-0 lg:sticky lg:top-3 space-y-3">
                <TrackRecordPanel scope="all" />
                <StrategyBuilder />
              </div>
            </div>
          </div>
        </div>
        <MacroCompliance />
      </div>
    </AppShell>
  );
}
