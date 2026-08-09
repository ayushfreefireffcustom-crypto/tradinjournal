'use client';

import type { MacroState } from '@/lib/macro-api';
import RegimeQuadrant from './regime-quadrant';
import ConfluencePanel from './confluence-panel';
import MarketTiles from './market-tiles';
import YieldCurve from './yield-curve';
import PolicyRates from './policy-rates';
import IndicatorGroups from './indicator-groups';
import MacroEventsHeadlines from './events-headlines';

/** The free-tier macro dashboard: regime + confluence + markets + grouped data. */
export default function MacroDashboard({ state }: { state: MacroState }) {
  return (
    <div className="space-y-3" data-testid="macro-dashboard">
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
        <RegimeQuadrant regime={state.regime} />
        <ConfluencePanel bias={state.bias} />
      </div>
      <MarketTiles markets={state.markets} bias={state.bias} />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <YieldCurve macro={state.macro} />
        <PolicyRates macro={state.macro} />
      </div>
      <IndicatorGroups macro={state.macro} />
      <MacroEventsHeadlines events={state.events} headlines={state.headlines} />
    </div>
  );
}
