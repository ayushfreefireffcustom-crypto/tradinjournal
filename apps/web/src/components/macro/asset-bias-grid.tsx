'use client';

import EmptyState from '@/components/v6/ui/empty-state';
import Link from '@/components/v6/ui/link';
import type { MacroState } from '@/lib/macro-api';
import { biasTone } from '@/lib/macro-format';
import { BiasTag, IChevronR, ScoreTrack, toneWord } from '@/components/v6/macro/ui';
import CountUp from './count-up';

const NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XAU: 'Gold',
  XAG: 'Silver',
  SPX: 'S&P 500',
  NDX: 'Nasdaq 100',
  OIL: 'Crude oil',
  DXY: 'US dollar index',
  UST: 'US Treasuries',
};

const PAIR: Record<string, string> = { XAU: 'XAUUSD', XAG: 'XAGUSD', DXY: 'DXY', UST: 'US10Y', OIL: 'WTI' };
const SHORT: Record<string, string> = { XAU: 'Gold', DXY: 'US dollar', UST: 'US 10Y yield', OIL: 'Crude oil' };

/** Asset bias tiles: score marker on a 0–100 track; each opens the asset deep dive. */
export default function AssetBiasGrid({ bias }: { bias: MacroState['bias'] }) {
  if (!bias.length) return <div className="x-card"><EmptyState icon="signal" ghost="cards" testId="macro-asset-bias-empty" title="No asset bias scores yet">Scores for each asset appear after the first macro update.</EmptyState></div>;
  return (
    <section className="x-card" data-testid="macro-asset-bias-grid" aria-labelledby="mc-ab-t">
      <div className="x-ch"><h2 id="mc-ab-t">Asset macro bias</h2><span className="x-sub">open an asset for the deep dive</span></div>
      <div className="mc-ab">
        {bias.map(b => {
          const tone = biasTone(b.label);
          const name = SHORT[b.asset] ?? NAMES[b.asset] ?? b.asset;
          const pair = PAIR[b.asset] ?? b.asset;
          return (
            <Link key={b.asset} href={`/macro/assets/${b.asset.toLowerCase()}`} className="mc-ab-t" data-testid={`macro-bias-card-${b.asset}`}
              aria-label={`${name}: ${toneWord(tone)} ${Math.round(b.score)}, open deep dive`}>
              <span className="mc-ab-h">
                <span className="mc-ab-n"><b>{name}</b><small className="m">{pair}</small></span>
                <IChevronR size={14} className="mc-ab-go" />
              </span>
              <span className="mc-ab-v">
                <b className="m"><CountUp value={Math.round(b.score)} duration={900} /></b>
                <BiasTag tone={tone} />
              </span>
              <ScoreTrack score={b.score} tone={tone} />
            </Link>
          );
        })}
      </div>
    </section>
  );
}
