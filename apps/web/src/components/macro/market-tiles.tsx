'use client';

import Link from '@/components/v6/ui/link';
import type { MacroState } from '@/lib/macro-api';
import { biasTone, formatMacroNumber, formatSignedPct } from '@/lib/macro-format';
import { tickerMark } from '@/lib/desk';
import { BiasTag, ScoreTrack } from '@/components/v6/macro/ui';
import CountUp from './count-up';

const NAMES: Record<string, string> = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
  XAU: 'Gold (spot)',
  XAG: 'Silver (spot)',
  DXY: 'Dollar index',
  SPX: 'S&P 500',
  NDX: 'Nasdaq 100',
  OIL: 'Crude oil',
  UST: 'US Treasuries',
};

/** Live market quotes fused with each asset's confluence bias. Table on desktop, list on phones. */
export default function MarketTiles({
  markets,
  bias,
}: {
  markets: MacroState['markets'];
  bias: MacroState['bias'];
}) {
  if (!markets.length) return null;
  const biasBy = new Map(bias.map(b => [b.asset, b]));
  const rows = markets.map(m => {
    const b = biasBy.get(m.symbol);
    const c = m.changePct;
    return { m, b, tone: b ? biasTone(b.label) : 'neutral' as const, chg: c == null ? '—' : formatSignedPct(c), chgCls: c == null || c === 0 ? 'x-muted' : c > 0 ? 'pos' : 'neg' };
  });
  const sym = (m: MacroState['markets'][number], b: unknown) => {
    const inner = <><span className="x-mk">{tickerMark(m.symbol)}</span><span><b>{m.symbol}</b><small>{NAMES[m.symbol] ?? m.symbol}</small></span></>;
    return b ? <Link href={`/macro/assets/${m.symbol.toLowerCase()}`} className="x-sym mc-lnk">{inner}</Link> : <span className="x-sym">{inner}</span>;
  };

  return (
    <section className="x-card" data-testid="macro-market-tiles">
      <div className="x-ch"><h2>Markets</h2><span className="x-sub">quotes with macro bias</span></div>
      <div className="mc-tbl-only">
        <table className="x-tbl mc-mkt">
          <thead><tr><th>Asset</th><th className="n">Price</th><th className="n">Change</th><th>Bias</th><th>Score</th></tr></thead>
          <tbody>
            {rows.map(({ m, b, tone, chg, chgCls }) => (
              <tr key={m.symbol} data-testid={`macro-tile-${m.symbol}`}>
                <td>{sym(m, b)}</td>
                <td className="n m">{formatMacroNumber(m.price)}</td>
                <td className={`n m ${chgCls}`}>{chg}</td>
                <td>{b ? <BiasTag tone={tone} label={b.label} /> : <span className="x-dim">—</span>}</td>
                <td>{b ? <span className="mc-mkt-s"><ScoreTrack score={b.score} tone={tone} /><CountUp value={b.score} className="m" /></span> : <span className="x-dim">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="mc-list-only mc-mlist" aria-label="Markets">
        {rows.map(({ m, b, tone, chg, chgCls }) => (
          <li key={m.symbol}>
            {sym(m, b)}
            <span className="mc-mlist-v"><b className="m">{formatMacroNumber(m.price)}</b><small className={`m ${chgCls}`}>{chg}</small></span>
            {b && <span className="mc-mlist-b"><BiasTag tone={tone} label={b.label} /><ScoreTrack score={b.score} tone={tone} /><span className="m">{Math.round(b.score)}</span></span>}
          </li>
        ))}
      </ul>
    </section>
  );
}
