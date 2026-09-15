'use client';

import { useEffect, useState } from 'react';
import { adminApi } from '@/lib/admin-api';

type Ops = Awaited<ReturnType<typeof adminApi.traderOps>>;

const VENDOR_LABEL: Record<string, string> = {
  unusual_whales: 'Unusual Whales',
  deribit: 'Deribit',
  benzinga: 'Benzinga',
  santiment: 'Santiment',
};

export function TraderOpsStrip() {
  const [ops, setOps] = useState<Ops | null>(null);

  useEffect(() => {
    let cancelled = false;
    adminApi
      .traderOps()
      .then((d) => {
        if (!cancelled) setOps(d);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ops) return null;

  const champ =
    ops.champion === 'lgbm' ? 'LightGBM serving' : ops.champion === 'logistic' ? 'Logistic champion' : 'Heuristic';

  return (
    <section className="tcard p-4 sm:p-5 min-w-0" data-testid="admin-trader-ops">
      <div className="flex items-center justify-between gap-2 mb-3">
        <div className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">SignalX</div>
        <div className="text-[11px] text-fg-2">{champ}</div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
        <Stat label="Graded samples" value={String(ops.sampleSize)} />
        <Stat label="Open paper" value={String(ops.openPaperPositions)} />
        <Stat label="Challenger" value={ops.lgbm.serving ? 'serving' : ops.lgbm.trained ? 'not serving' : 'untrained'} />
        <Stat label="Last train" value={ops.lastTrain ? new Date(ops.lastTrain).toLocaleString() : '—'} />
      </div>
      {ops.lgbm.reason && <p className="mt-2 text-[11px] text-fg-3">{ops.lgbm.reason}</p>}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {ops.vendors.map((v) => (
          <span
            key={v.id}
            className={`text-[10px] px-1.5 py-0.5 rounded border ${
              v.ok ? 'border-profit/25 text-profit' : 'border-border text-fg-3'
            }`}
          >
            {VENDOR_LABEL[v.id] ?? v.id}
            {v.ok == null ? '' : v.ok ? ' · live' : ' · down'}
          </span>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10px] uppercase tracking-wider text-fg-3">{label}</div>
      <div className="mt-0.5 text-fg tabular-nums truncate">{value}</div>
    </div>
  );
}
