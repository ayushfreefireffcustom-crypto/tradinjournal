'use client';

// A coin's logo (CoinCap's public icon CDN, which allows embedding), falling
// back to its initials when there's no logo or it fails to load.
import { useState } from 'react';

/** BTCUSDT, BTC/USDT, BTC-PERP, 1000PEPEUSDT → BTC, PEPE. */
export function coinBase(symbol: string): string {
  let s = symbol.toUpperCase().replace(/-PERP$/, '').split('/')[0]!;
  s = s.replace(/(USDT|USDC|FDUSD|BUSD|USD)$/, '') || s;
  return s.replace(/^(1000000|10000|1000|1M)(?=[A-Z])/, '');
}

export default function CoinMark({ symbol, size }: { symbol: string; size?: 'lg' }) {
  const base = coinBase(symbol);
  const [failed, setFailed] = useState(false);
  return (
    <span className={`lx-coin${size === 'lg' ? ' lx-coin--lg' : ''}`} aria-hidden>
      {failed || !/^[A-Z0-9]{1,12}$/.test(base)
        ? base.slice(0, base.length > 3 ? 2 : 3)
        : <img src={`https://assets.coincap.io/assets/icons/${base.toLowerCase()}@2x.png`} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />}
    </span>
  );
}
