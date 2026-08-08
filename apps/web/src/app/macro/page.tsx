'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import MacroTicker from '@/components/macro/macro-ticker';
import MacroDashboard from '@/components/macro/macro-dashboard';
import BullBearScanner from '@/components/macro/bull-bear-scanner';
import MembershipPanel from '@/components/macro/membership-panel';
import SignalBoard from '@/components/macro/signal-board';
import MacroAssistant from '@/components/macro/macro-assistant';
import PaperBlotter, { paperFillFromSignal, type PaperFill } from '@/components/macro/paper-blotter';
import MacroCompliance from '@/components/macro/macro-compliance';
import { formatAsOf } from '@/lib/macro-format';
import { macroApi, type MacroSignal, type MacroState } from '@/lib/macro-api';

type Tab = 'dashboard' | 'scanner' | 'signals' | 'assistant' | 'paper' | 'access';

export default function MacroPage() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const [state, setState] = useState<MacroState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [fills, setFills] = useState<PaperFill[]>([]);

  const load = useCallback(async () => {
    setError('');
    try {
      setState(await macroApi.state());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load macro state');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 60_000);
    return () => clearInterval(t);
  }, [load]);

  function onPaperFill(s: MacroSignal) {
    const fill = paperFillFromSignal(s);
    if (!fill) return;
    setFills(f => [fill, ...f]);
    setTab('paper');
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'scanner', label: 'Bull / Bear' },
    { id: 'signals', label: 'Signals' },
    { id: 'assistant', label: 'Assistant' },
    { id: 'paper', label: 'Paper' },
    { id: 'access', label: 'Access' },
  ];

  return (
    <AppShell pageTitle="Macro" pageSubtitle="// GLOBAL MACRO">
      <div className="flex flex-col h-full min-h-0" data-testid="macro-page">
        <MacroTicker markets={state?.markets ?? []} />

        <div className="shrink-0 border-b border-border-soft px-3 py-2 flex flex-wrap items-center gap-1.5">
          {tabs.map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              data-testid={`macro-tab-${t.id}`}
              className={`px-3 py-1.5 text-[11px] tracking-[0.12em] uppercase rounded-[var(--radius-btn)] border transition-colors ${
                tab === t.id
                  ? 'bg-profit/15 text-fg border-profit/30'
                  : 'text-fg-3 border-border-soft hover:text-fg'
              }`}
            >
              {t.label}
            </button>
          ))}
          <div className="ml-auto flex items-center gap-2 text-[11px] text-fg-3 numeric">
            {state && (
              <span data-testid="macro-state-line">
                {state.engineVer} · {state.macro.length} ind · {formatAsOf(state.asOf)}
              </span>
            )}
            <button
              type="button"
              onClick={() => { setLoading(true); void load(); }}
              className="text-fg-3 hover:text-fg underline-offset-2 hover:underline"
              data-testid="macro-refresh"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
          {error && (
            <div className="tcard p-3 text-loss text-sm" data-testid="macro-error" role="alert">
              {error}
            </div>
          )}

          {loading && !state && (
            <div className="tcard p-6 text-sm text-fg-3" data-testid="macro-loading">
              Loading macro state…
            </div>
          )}

          {!loading && !error && state && state.macro.length === 0 && tab === 'dashboard' && (
            <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-empty">
              No macro snapshots yet. Add <code className="text-fg">FRED_API_KEY</code>, apply the
              macro migration, and let the worker ingest.
            </div>
          )}

          {tab === 'dashboard' && state && <MacroDashboard state={state} />}

          {tab === 'scanner' && <BullBearScanner bias={state?.bias ?? []} />}
          {tab === 'signals' && <SignalBoard onPaperFill={onPaperFill} onRequestAccess={() => setTab('access')} />}
          {tab === 'assistant' && <MacroAssistant />}
          {tab === 'paper' && <PaperBlotter fills={fills} onClear={() => setFills([])} />}
          {tab === 'access' && <MembershipPanel />}
        </div>

        <MacroCompliance />
      </div>
    </AppShell>
  );
}
