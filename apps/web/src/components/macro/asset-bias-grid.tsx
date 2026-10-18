'use client';

import Link from 'next/link';
import { CaretRight } from '@phosphor-icons/react';
import type { MacroState } from '@/lib/macro-api';
import { biasTone } from '@/lib/macro-format';
import CountUp from './count-up';

const NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XAU: 'Gold',
  XAG: 'Silver',
  SPX: 'S&P 500',
  NDX: 'Nasdaq 100',
  OIL: 'Crude Oil',
  DXY: 'US Dollar Index',
  UST: 'US Treasuries',
};


const PAIR: Record<string, string> = { XAU: 'XAUUSD', XAG: 'XAGUSD', DXY: 'DXY', BTC: '', ETH: '', UST: '', OIL: '', SPX: '', NDX: '' };
const SHORT: Record<string, string> = { XAU: 'Gold', DXY: 'US dollar', UST: 'US 10Y yield', OIL: 'Crude oil' };
const word = (t: ReturnType<typeof biasTone>) => (t === 'bull' ? 'Bullish' : t === 'bear' ? 'Bearish' : 'Neutral');

/** Asset bias cards — score marker on a 0–100 track; tap for the deep dive. */
export default function AssetBiasGrid({ bias }: { bias: MacroState['bias'] }) {
  if (!bias.length) return <div className="v3-card d-empty" data-testid="macro-asset-bias-empty">No asset bias scores yet.</div>;
  return (
    <section className="v3-card mb" data-testid="macro-asset-bias-grid" aria-labelledby="mb-t">
      <div className="mb-hd"><h3 id="mb-t" className="mc-lbl">Asset macro bias</h3><span>Tap a card to open the deep dive</span></div>
      <div className="mb-grid">
        {bias.map((b, i) => {
          const tone = biasTone(b.label);
          const name = SHORT[b.asset] ?? NAMES[b.asset] ?? b.asset;
          const pair = PAIR[b.asset];
          return (
            <Link key={b.asset} href={`/macro/assets/${b.asset.toLowerCase()}`} className={`mb-card ${tone}`} data-testid={`macro-bias-card-${b.asset}`}
              aria-label={`${name}: ${word(tone)} ${Math.round(b.score)} — open deep dive`} style={{ animationDelay: `${i * 50}ms` }}>
              <span className="nm">{name}{pair ? <> · {pair}</> : null}</span>
              <b className="num">{word(tone)} <CountUp value={Math.round(b.score)} duration={900} /></b>
              <span className="trk"><i style={{ left: `${Math.max(2, Math.min(98, b.score))}%` }} /></span>
              <span className="go">Open <CaretRight size={11} weight="bold" /></span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
