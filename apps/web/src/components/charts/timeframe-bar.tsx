'use client';

import { MARKET_TIMEFRAMES, type MarketTimeframe } from '@/lib/market-api';

const LABEL: Record<MarketTimeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m',
  '1h': '1H', '4h': '4H', '1d': '1D', '1w': '1W', '1M': '1M',
};

export default function TimeframeBar({ value, onChange }: { value: MarketTimeframe; onChange: (tf: MarketTimeframe) => void }) {
  return (
    <div className="flex items-center gap-1" data-testid="timeframe-bar">
      {MARKET_TIMEFRAMES.map(tf => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          data-testid={`tf-${tf}`}
          className={`px-2 py-1 rounded text-[10px] font-semibold tracking-wide transition-colors ${
            value === tf ? 'bg-profit/15 text-profit border border-profit/30' : 'text-fg-3 border border-transparent hover:text-fg'
          }`}
        >
          {LABEL[tf]}
        </button>
      ))}
    </div>
  );
}
