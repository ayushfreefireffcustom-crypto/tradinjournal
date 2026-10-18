'use client';

import { MARKET_TIMEFRAMES, type MarketTimeframe } from '@/lib/market-api';

const LABEL: Record<MarketTimeframe, string> = {
  '1m': '1m', '5m': '5m', '15m': '15m', '30m': '30m', '1h': '1h', '4h': '4h', '1d': '1d', '1w': '1w', '1M': '1M',
};

export default function TimeframeBar({ value, onChange }: { value: MarketTimeframe; onChange: (tf: MarketTimeframe) => void }) {
  return (
    <div className="ch-tf" role="group" aria-label="Timeframe" data-testid="timeframe-bar">
      {MARKET_TIMEFRAMES.filter(tf => tf !== '1M').map(tf => (
        <button key={tf} aria-pressed={value === tf} onClick={() => onChange(tf)} data-testid={`tf-${tf}`}>{LABEL[tf]}</button>
      ))}
    </div>
  );
}
