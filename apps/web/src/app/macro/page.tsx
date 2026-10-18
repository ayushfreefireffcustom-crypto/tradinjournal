'use client';

import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import type { BrokerAccount } from '@/lib/api';
import { Loader } from '@/components/loader';
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
import { macroApi, type MacroSignal, type MacroState } from '@/lib/macro-api';

export default function MacroPage() {
  const { accounts, selected, select } = useAccounts();
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
    <AppShell accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)} pageTitle="Macro">
      {loading && !state ? (
        <div className="mc-load" data-testid="macro-loading"><Loader label="Loading macro" /></div>
      ) : (
        <div className="mc" data-testid="macro-page">
          <MacroTicker markets={state?.markets ?? []} />

          <div className="mc-bar">
            <button type="button" className="v3-btn v3-btn--o mc-menu" onClick={() => setNavOpen(true)} data-testid="macro-nav-open">Menu</button>
            <button type="button" onClick={() => setSearchOpen(true)} className="v3-field mc-search" data-testid="macro-search-trigger">
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" strokeLinecap="round" /></svg>
              <span>Search indicators, assets…</span><kbd>⌘K</kbd>
            </button>
            {state && (
              <span className="mc-meta num" data-testid="macro-state-line">
                {refreshing && <Loader size={14} className="!gap-0" />}
                {state.engineVer} · {state.macro.length} indicators · as of {new Date(state.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })} UTC ·{' '}
                <button type="button" onClick={() => void load({ soft: true })} disabled={refreshing} className="v3-link" data-testid="macro-refresh">Refresh</button>
              </span>
            )}
          </div>

          <div className="mc-body">
            <MacroSideNav
              active={panel}
              onSelect={setPanel}
              mobileOpen={navOpen}
              onMobileClose={() => setNavOpen(false)}
            />

            <div className="mc-main">
              {error && (
                <div className="d-err" data-testid="macro-error" role="alert">
                  <span>{error}</span>
                  <button type="button" onClick={() => void load()} className="v3-btn v3-btn--o">Retry</button>
                </div>
              )}

              {!error && state && state.macro.length === 0 && panel === 'dashboard' && (
                <div className="v3-card d-empty" data-testid="macro-empty"><b>No macro data yet</b>Indicators appear after the first data ingest.</div>
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
                <div className="mc-2">
                  <RegimeNarrative regime={state.regime} macro={state.macro} />
                  <RegimeQuadrant regime={state.regime} />
                </div>
              )}
              {panel === 'fed' && state && <FedDesk macro={state.macro} />}
              {panel === 'liquidity' && state && <LiquidityConsole macro={state.macro} />}
              {panel === 'yields' && state && (
                <div className="mc-2">
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
