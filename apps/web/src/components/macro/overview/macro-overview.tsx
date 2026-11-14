'use client';

// Macro overview (design E "map"): regime map + the inputs behind it, the
// assets × drivers grid, the surprise map, cut odds per FOMC meeting from Fed
// funds futures (Treasury-based proxy when those don't answer), and the
// estimated BTC liquidation ladder + max-pain board.
// Data: GET /api/macro/state → `overview` (engine, deterministic) and the
// liquidations API (estimates). Every block degrades on its own.
import type { MacroState } from '@/lib/macro-api';
import { useTradedSymbols } from '@/lib/use-traded-symbols';
import RegimeMap from './regime-map';
import Inputs from './inputs';
import DriversGrid from './drivers-grid';
import SurpriseMap from './surprise-map';
import CutsProxy from './cuts-proxy';
import CutsByMeeting from './cuts-meetings';
import { LiqLadder, MaxPainBlock, useLiquidations } from './liquidations';
import { AiLine, Quiet } from './parts';
import { monthLong, ordinal } from './format';
import '@/styles/v6/macro-overview.css';

export default function MacroOverview({ state, accountId }: { state: MacroState; accountId: string | null }) {
  const o = state.overview;
  const trail = o?.regime ?? null;
  const { symbols, ready } = useTradedSymbols(accountId);
  const traded = accountId && ready ? symbols : null;
  const liq = useLiquidations();

  const regimeWord = trail?.label ?? (state.regime && state.regime.label !== 'Unclear' ? state.regime.label : 'Unclear');

  return (
    <div className="mo" data-testid="macro-overview">
      <div className="mo-m1">
        <section aria-labelledby="mo-h-regime">
          <div className="mo-lead">
            <h2 id="mo-h-regime" className="mo-q">{regimeWord}</h2>
            {trail && <span className="mo-lead-s">since {monthLong(trail.since)} · {ordinal(trail.months)} month</span>}
          </div>
          {trail ? (
            <AiLine text={trail.line} detail={`${trail.seriesCount} FRED series`} />
          ) : (
            <p className="mo-note">{state.regime ? 'From the latest prints only. The 12-month trail needs about 30 months of history.' : 'Not enough data to place the regime yet.'}</p>
          )}
          <div className="mo-mt14"><RegimeMap trail={trail} /></div>
        </section>
        <section aria-label="What put us here">
          <Inputs inputs={o?.inputs ?? []} />
        </section>
      </div>

      {o ? (
        <DriversGrid grid={o.grid} drivers={o.drivers} inputs={o.inputs} traded={traded} />
      ) : (
        <section className="mo-sec"><Quiet>Driver scores appear after the next macro update.</Quiet></section>
      )}

      <section className="mo-sec mo-m3c">
        <SurpriseMap surprise={o?.surprise ?? null} />
        {o?.fedwatch?.rows.length ? <CutsByMeeting fw={o.fedwatch} /> : <CutsProxy cuts={o?.cuts ?? null} />}
      </section>

      <section className="mo-sec mo-m4">
        <LiqLadder state={liq.map} onRetry={liq.reload} />
        <MaxPainBlock board={liq.board} map={liq.map} onRetry={liq.reload} />
      </section>

      <p className="mo-foot">FRED · US economic calendar · {o?.fedwatch?.rows.length ? 'CBOT Fed funds futures' : 'Treasury yields vs Fed funds'} · liquidation values are estimates · not investment advice</p>
    </div>
  );
}
