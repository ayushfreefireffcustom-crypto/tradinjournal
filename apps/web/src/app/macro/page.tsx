'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { LoadingScreen, Loader } from '@/components/loader';
import MacroTicker from '@/components/macro/macro-ticker';
import MacroDashboard from '@/components/macro/macro-dashboard';
import BullBearScanner from '@/components/macro/bull-bear-scanner';
import MembershipPanel from '@/components/macro/membership-panel';
import SignalBoard from '@/components/macro/signal-board';
import MacroAssistant from '@/components/macro/macro-assistant';
import PaperBlotter, { paperFillFromSignal, type PaperFill } from '@/components/macro/paper-blotter';
import MacroCompliance from '@/components/macro/macro-compliance';
import MacroSideNav, { type MacroPanel } from '@/components/macro/macro-side-nav';
import MacroSearch from '@/components/macro/macro-search';
import LiquidityConsole from '@/components/macro/liquidity-console';
import FedDesk from '@/components/macro/fed-desk';
import ForexMatrix from '@/components/macro/forex-matrix';
import GeoRisk from '@/components/macro/geo-risk';
import MacroCalendarPanel from '@/components/macro/macro-calendar-panel';
import MacroEducation from '@/components/macro/macro-education';
import ConfluencePanel from '@/components/macro/confluence-panel';
import RegimeQuadrant from '@/components/macro/regime-quadrant';
import RegimeNarrative from '@/components/macro/regime-narrative';
import YieldCurve from '@/components/macro/yield-curve';
import PolicyRates from '@/components/macro/policy-rates';
import { formatAsOf } from '@/lib/macro-format';
import { macroApi, type MacroSignal, type MacroState } from '@/lib/macro-api';

export default function MacroPage() {
  const [panel, setPanel] = useState<MacroPanel>('dashboard');
  const [state, setState] = useState<MacroState | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [fills, setFills] = useState<PaperFill[]>([]);
  const [navOpen, setNavOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  const load = useCallback(async (opts?: { soft?: boolean }) => {
    setError('');
    if (opts?.soft) setRefreshing(true);
    try {
      setState(await macroApi.state());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load macro state');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load({ soft: true }), 60_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    const open = () => setSearchOpen(true);
    document.addEventListener('macro-search-open', open);
    return () => document.removeEventListener('macro-search-open', open);
  }, []);

  function onPaperFill(s: MacroSignal) {
    const fill = paperFillFromSignal(s);
    if (!fill) return;
    setFills(f => [fill, ...f]);
    setPanel('paper');
  }

  return (
    <AppShell pageTitle="Macro" pageSubtitle="// GLOBAL MACRO COMMAND CENTRE">
      {loading && !state ? (
        <div className="h-full min-h-[60vh]" data-testid="macro-loading">
          <LoadingScreen label="Loading macro" />
        </div>
      ) : (
        <div className="flex flex-col h-full min-h-0" data-testid="macro-page">
          <MacroTicker markets={state?.markets ?? []} />

          <div className="shrink-0 border-b border-border-soft bg-surface/30 px-3 sm:px-4 py-2 sm:py-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="md:hidden shrink-0 btn btn-ghost py-1.5 px-2.5 text-[10px]"
                onClick={() => setNavOpen(true)}
                data-testid="macro-nav-open"
              >
                MENU
              </button>

              <button
                type="button"
                onClick={() => setSearchOpen(true)}
                className="group flex-1 min-w-0 flex items-center gap-2 text-left text-[12px] text-fg-3 bg-app/60 border border-border-soft hover:border-border-strong rounded-full px-3 py-2 transition-colors focus-ring"
                data-testid="macro-search-trigger"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="shrink-0 text-fg-3 opacity-70" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
                </svg>
                <span className="truncate">Search…</span>
                <kbd className="ml-auto hidden sm:inline-flex items-center gap-0.5 shrink-0 rounded border border-border-soft bg-surface px-1.5 py-0.5 text-[10px] tracking-wide text-fg-3 group-hover:text-fg-2">
                  ⌘K
                </kbd>
              </button>

              <div className="hidden sm:flex items-center gap-3 text-[11px] text-fg-3 numeric shrink-0">
                {refreshing && <Loader size={14} className="!gap-0" />}
                {state && (
                  <span className="truncate max-w-[220px]" data-testid="macro-state-line">
                    {state.engineVer} · {state.macro.length} ind · {formatAsOf(state.asOf)}
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => void load({ soft: true })}
                  disabled={refreshing}
                  className="shrink-0 text-fg-3 hover:text-fg underline-offset-2 hover:underline disabled:opacity-50"
                  data-testid="macro-refresh"
                >
                  Refresh
                </button>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex">
            <MacroSideNav
              active={panel}
              onSelect={setPanel}
              mobileOpen={navOpen}
              onMobileClose={() => setNavOpen(false)}
            />

            <div className="flex-1 min-w-0 min-h-0 overflow-y-auto p-3 sm:p-4 space-y-3">
              {error && (
                <div className="tcard p-3 text-loss text-sm flex items-center justify-between gap-3" data-testid="macro-error" role="alert">
                  <span>{error}</span>
                  <button type="button" onClick={() => void load()} className="btn btn-ghost py-1.5 text-[10px] shrink-0">
                    RETRY
                  </button>
                </div>
              )}

              {!error && state && state.macro.length === 0 && panel === 'dashboard' && (
                <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-empty">
                  No macro snapshots yet. Add <code className="text-fg">FRED_API_KEY</code>, apply the
                  macro migration, and let the worker ingest.
                </div>
              )}

              {panel === 'dashboard' && state && <MacroDashboard state={state} />}
              {panel === 'confluence' && state && (
                <div className="space-y-3">
                  <div className="text-[10px] tracking-[0.2em] text-fg-3">// CONFLUENCE ENGINE</div>
                  <ConfluencePanel bias={state.bias} />
                  <BullBearScanner bias={state.bias} />
                </div>
              )}
              {panel === 'scanner' && <BullBearScanner bias={state?.bias ?? []} />}
              {panel === 'regime' && state && (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
                  <RegimeNarrative regime={state.regime} macro={state.macro} />
                  <RegimeQuadrant regime={state.regime} />
                </div>
              )}
              {panel === 'fed' && state && <FedDesk macro={state.macro} />}
              {panel === 'liquidity' && state && <LiquidityConsole macro={state.macro} />}
              {panel === 'yields' && state && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
                  <YieldCurve macro={state.macro} />
                  <PolicyRates macro={state.macro} />
                </div>
              )}
              {panel === 'calendar' && <MacroCalendarPanel events={state?.events ?? []} />}
              {panel === 'fx' && <ForexMatrix fx={state?.fx ?? []} />}
              {panel === 'geo' && <GeoRisk headlines={state?.headlines ?? []} />}
              {panel === 'education' && <MacroEducation />}
              {panel === 'signals' && (
                <SignalBoard onPaperFill={onPaperFill} onRequestAccess={() => setPanel('access')} />
              )}
              {panel === 'assistant' && (
                <div className="h-[min(calc(100dvh-220px),620px)] min-h-[420px]">
                  <MacroAssistant />
                </div>
              )}
              {panel === 'paper' && <PaperBlotter fills={fills} onClear={() => setFills([])} />}
              {panel === 'access' && <MembershipPanel />}
            </div>
          </div>

          <MacroCompliance />
        </div>
      )}

      <MacroSearch
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        state={state}
        onNavigate={id => setPanel(id as MacroPanel)}
      />
    </AppShell>
  );
}
