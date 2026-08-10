'use client';

import type { MacroState } from '@/lib/macro-api';
import GlobalBiasGauge from './global-bias-gauge';
import RegimeNarrative from './regime-narrative';
import AssetBiasGrid from './asset-bias-grid';
import SummaryCards from './summary-cards';
import MarketTiles from './market-tiles';
import YieldCurve from './yield-curve';
import PolicyRates from './policy-rates';
import IndicatorGroups from './indicator-groups';
import MacroEventsHeadlines from './events-headlines';
import ConfluencePanel from './confluence-panel';
import RegimeQuadrant from './regime-quadrant';

/** Command-centre dashboard — IITian density: hero → bias grid → summaries → deep data. */
export default function MacroDashboard({ state }: { state: MacroState }) {
  return (
    <div className="space-y-3" data-testid="macro-dashboard">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
        <GlobalBiasGauge bias={state.bias} />
        <RegimeNarrative regime={state.regime} macro={state.macro} />
      </div>

      <AssetBiasGrid bias={state.bias} />
      <SummaryCards macro={state.macro} />

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3 items-stretch">
        <RegimeQuadrant regime={state.regime} />
        <ConfluencePanel bias={state.bias} />
      </div>

      <MarketTiles markets={state.markets} bias={state.bias} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 items-stretch">
        <YieldCurve macro={state.macro} />
        <PolicyRates macro={state.macro} />
      </div>

      <IndicatorGroups macro={state.macro} />
      <MacroEventsHeadlines events={state.events} headlines={state.headlines} />
    </div>
  );
}
