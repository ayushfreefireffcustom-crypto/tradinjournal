'use client';

import AppShell from '@/components/app-shell';
import MacroCompliance from '@/components/macro/macro-compliance';
import TraderMaster from '@/components/trader/trader-master';
import TrackRecordPanel from '@/components/trader/track-record';

export default function TraderPage() {
  return (
    <AppShell pageTitle="Trader Master" pageSubtitle="// AI TRADE ANALYSIS">
      <div className="flex flex-col h-full min-h-0" data-testid="trader-page">
        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-5">
          <div className="mx-auto w-full max-w-6xl">
            <header className="mb-4 sm:mb-5 animate-[fade-up_0.4s_ease_both]">
              <div className="text-[10px] tracking-[0.22em] text-fg-3">// TRADER MASTER</div>
              <h1 className="mt-1 font-display font-black text-2xl sm:text-3xl tracking-tight text-fg">
                Structured reads. Honest outcomes.
              </h1>
              <p className="text-[13px] text-fg-3 mt-1.5 leading-relaxed max-w-2xl">
                Engine-owned direction with entry, stop, and targets — then graded against live candles.
                Confidence is shown next to what actually happened, including the losses.
              </p>
            </header>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 lg:gap-5 items-start">
              <div className="lg:col-span-3 min-w-0">
                <TraderMaster />
              </div>
              <div className="lg:col-span-2 min-w-0 lg:sticky lg:top-3 space-y-4">
                <TrackRecordPanel scope="all" />
              </div>
            </div>
          </div>
        </div>
        <MacroCompliance />
      </div>
    </AppShell>
  );
}
