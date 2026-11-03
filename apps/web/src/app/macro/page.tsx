'use client';

import EmptyState from '@/components/v6/ui/empty-state';
import { useCallback, useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useAccounts } from '@/lib/use-accounts';
import type { BrokerAccount } from '@/lib/api';
import MacroTicker from '@/components/macro/macro-ticker';
import MacroDashboard from '@/components/macro/macro-dashboard';
import BullBearScanner from '@/components/macro/bull-bear-scanner';
import MembershipPanel from '@/components/macro/membership-panel';
import SignalBoard from '@/components/macro/signal-board';
import MacroAssistant from '@/components/macro/macro-assistant';
import PaperBlotter, { paperFillFromSignal, type PaperFill } from '@/components/macro/paper-blotter';
import MacroCompliance from '@/components/v6/macro/compliance';
import { MACRO_NAV, type MacroPanel } from '@/components/macro/macro-side-nav';
import { IRefresh, ISearch } from '@/components/v6/macro/ui';
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

  const section = MACRO_NAV.find(s => s.items.some(i => i.id === panel)) ?? MACRO_NAV[0]!;
  const asOf = state ? new Date(state.asOf).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' }) : '';
  const subtitle = state ? (
    <span className="mc-state" data-testid="macro-state-line">
      <span><span className="m">{state.macro.length}</span> indicators</span><span>·</span><span>as of <span className="m">{asOf}</span> UTC</span>
    </span>
  ) : 'Global macro, regime and asset bias';
  const actions = (
    <>
      <button type="button" onClick={() => setSearchOpen(true)} className="x-btn mc-strig" data-testid="macro-search-trigger" aria-label="Search indicators, assets and events">
        <ISearch /><span>Search macro</span>
      </button>
      {state && (
        <button type="button" onClick={() => void load({ soft: true })} disabled={refreshing} aria-busy={refreshing} className="x-btn x-btn--icon"
          aria-label="Refresh macro data" title="Refresh" data-testid="macro-refresh">
          <IRefresh className={refreshing ? 'x-spin' : undefined} />
        </button>
      )}
    </>
  );

  return (
    <AppShell legacy={false} accounts={accounts} selectedAccount={selected} onSelectAccount={(a: BrokerAccount) => select(a)}
      pageTitle="Macro" pageSubtitle={subtitle} actions={actions}>
      {loading && !state ? (
        <div className="mc" data-testid="macro-loading" role="status" aria-label="Loading macro">
          <div className="x-skel mc-sk-tape" />
          <div className="mc-body">
            <div className="x-skel mc-sk-rail" />
            <div className="mc-stack">
              <div className="mc-hero"><div className="x-skel mc-sk-card" /><div className="x-skel mc-sk-card" /></div>
              <div className="x-skel mc-sk-wide" />
            </div>
          </div>
        </div>
      ) : (
        <div className="mc" data-testid="macro-page">
          <MacroTicker markets={state?.markets ?? []} asOf={state?.markets?.length ? state.markets.map(m => m.asOf).sort().at(-1) : null} />

          {/* Sections as tabs, then the section's views (A4.10): no second sidebar, and on phones
              both rows scroll sideways instead of hiding behind a menu. */}
          <div className="mc-tabs" data-testid="macro-side-nav">
            <nav className="x-tabs" role="tablist" aria-label="Macro sections">
              {MACRO_NAV.map(s => (
                <button key={s.section} type="button" role="tab" aria-selected={s === section} onClick={() => setPanel(s.items[0]!.id)} data-testid={`macro-sec-${s.section.toLowerCase().replace(/[^a-z]+/g, '-')}`}>{s.section}</button>
              ))}
            </nav>
            <div className="x-seg x-seg--sm mc-views" role="tablist" aria-label={`${section.section} views`}>
              {section.items.map(it => (
                <button key={it.id} type="button" role="tab" aria-selected={panel === it.id} onClick={() => setPanel(it.id)} data-testid={`macro-nav-${it.id}`} data-active={panel === it.id}>{it.label}</button>
              ))}
            </div>
          </div>

          <div className="mc-body">
            <div className="mc-main">

              {error && (
                <div className="x-banner x-banner--err" data-testid="macro-error" role="alert">
                  <span>{error}</span>
                  <button type="button" onClick={() => void load()} className="x-btn x-btn--sm">Retry</button>
                </div>
              )}

              {!error && state && state.macro.length === 0 && panel === 'dashboard' && (
                <div className="x-card"><EmptyState icon="globe" ghost="chart" testId="macro-empty" title="No macro data yet" hints={['Rates', 'Inflation', 'Jobs', 'Liquidity']}>Rates, inflation, jobs and liquidity readings, with a score for each asset, appear after the first macro update.</EmptyState></div>
              )}

              {/* No data yet: just say so, rather than a page of neutral 50s that were never measured. */}
              {panel === 'dashboard' && state && state.macro.length > 0 && <MacroDashboard state={state} />}
              {panel === 'confluence' && state && (
                <div className="mc-stack">
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
                <div className="mc-2 mc-2--yc">
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
                <div className="mc-chatwrap">
                  <MacroAssistant />
                </div>
              )}
              {panel === 'paper' && <PaperBlotter fills={fills} onClear={() => setFills([])} onOpenSignals={() => setPanel('signals')} />}
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
