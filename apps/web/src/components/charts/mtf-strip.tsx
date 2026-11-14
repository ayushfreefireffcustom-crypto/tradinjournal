'use client';

// Multi-timeframe strip (E): 1m → 1D tiles with mini candles, a direction and
// one reason, read from the same candles API as the chart. Collapses to one
// line of chips; the choice is remembered on this device.
import { useEffect, useState } from 'react';
import { ArrowDownRight, ArrowRight, ArrowUpRight, CaretDown, CaretUp } from '@phosphor-icons/react';
import { marketApi, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { classifyTrend, px, type TrendRead } from './trade-math';

const TFS: Array<{ tf: MarketTimeframe; label: string }> = [
  { tf: '1m', label: '1M' }, { tf: '5m', label: '5M' }, { tf: '15m', label: '15M' },
  { tf: '1h', label: '1H' }, { tf: '4h', label: '4H' }, { tf: '1d', label: '1D' },
];
const KEY = 'tradelogs.charts.mtf';

type Tile = { bars: Candle[]; read: TrendRead | null } | 'error';

function MiniCandles({ bars }: { bars: Candle[] }) {
  const last = bars.slice(-26);
  if (last.length < 2) return null;
  const lo = Math.min(...last.map(b => b.low));
  const hi = Math.max(...last.map(b => b.high));
  const span = hi - lo || 1;
  const W = 160, H = 34, step = W / last.length;
  const y = (v: number) => 2 + ((hi - v) / span) * (H - 4);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="tl-mini" aria-hidden>
      {last.map((b, i) => {
        const up = b.close >= b.open;
        const x = i * step + step / 2;
        const top = y(Math.max(b.open, b.close));
        return (
          <g key={b.openTime} className={up ? 'u' : 'd'}>
            <line x1={x} x2={x} y1={y(b.high)} y2={y(b.low)} vectorEffect="non-scaling-stroke" />
            <rect x={x - step * 0.3} width={step * 0.6} y={top} height={Math.max(1, y(Math.min(b.open, b.close)) - top)} />
          </g>
        );
      })}
    </svg>
  );
}

const Dir = ({ d }: { d: TrendRead['dir'] }) => (
  <b className={`tl-mtf-d ${d === 'up' ? 'pos' : d === 'down' ? 'neg' : ''}`}>
    {d === 'up' ? <ArrowUpRight size={13} weight="bold" aria-hidden /> : d === 'down' ? <ArrowDownRight size={13} weight="bold" aria-hidden /> : <ArrowRight size={13} weight="bold" aria-hidden />}
    {d === 'up' ? 'Up' : d === 'down' ? 'Down' : 'Range'}
  </b>
);

export default function MtfStrip({ symbol, active, onPick }: { symbol: string; active: MarketTimeframe; onPick: (tf: MarketTimeframe) => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => { try { setOpen(localStorage.getItem(KEY) !== '0'); } catch { /* storage off: stays open */ } }, []);
  const toggle = () => setOpen(o => { try { localStorage.setItem(KEY, o ? '0' : '1'); } catch { /* ignore */ } return !o; });

  const [tiles, setTiles] = useState<{ symbol: string; data: Partial<Record<MarketTimeframe, Tile>> }>({ symbol: '', data: {} });
  useEffect(() => {
    let alive = true;
    setTiles({ symbol, data: {} });
    const load = () => TFS.forEach(({ tf }) => {
      marketApi.candles({ symbol, tf, limit: 60 })
        .then(({ candles }) => {
          if (!alive) return;
          const fmt = (n: number) => px(n, Math.abs(n) >= 1000 ? 0 : undefined);
          setTiles(s => (s.symbol === symbol ? { symbol, data: { ...s.data, [tf]: { bars: candles, read: classifyTrend(candles, fmt) } } } : s));
        })
        .catch(() => { if (alive) setTiles(s => (s.symbol === symbol ? { symbol, data: { ...s.data, [tf]: s.data[tf] && s.data[tf] !== 'error' ? s.data[tf] : 'error' } } : s)); });
    });
    load();
    const t = setInterval(() => { if (document.visibilityState === 'visible') load(); }, 60_000);
    return () => { alive = false; clearInterval(t); };
  }, [symbol]);

  const data = tiles.symbol === symbol ? tiles.data : {};
  const failed = TFS.every(({ tf }) => data[tf] === 'error');

  return (
    <section className={`tl-card tl-mtf ${open ? '' : 'is-closed'}`} aria-label={`${symbol} on six timeframes`} data-testid="mtf-strip">
      {open ? (
        <div className="tl-mtf-grid">
          {TFS.map(({ tf, label }) => {
            const t = data[tf];
            return (
              <button key={tf} type="button" className={`tl-mtf-tile ${tf === active ? 'on' : ''}`} onClick={() => onPick(tf)} aria-pressed={tf === active} data-testid={`mtf-${tf}`}>
                <span className="tl-mtf-h">
                  <span className="tl-cap">{label}</span>
                  {t && t !== 'error' && t.read ? <><Dir d={t.read.dir} /><span className="tl-mtf-n">{t.read.reason}</span></> : <span className="tl-mtf-n">{t === 'error' ? 'No data' : t ? 'Too few bars' : ''}</span>}
                </span>
                {t && t !== 'error' ? <MiniCandles bars={t.bars} /> : <span className={`tl-mini ${t ? '' : 'x-skel'}`} />}
              </button>
            );
          })}
        </div>
      ) : (
        <div className="tl-mtf-line" data-testid="mtf-collapsed">
          {failed ? <span className="tl-mtf-n">Timeframes unavailable</span> : TFS.map(({ tf, label }) => {
            const t = data[tf];
            return (
              <button key={tf} type="button" className={`tl-mtf-chip ${tf === active ? 'on' : ''}`} onClick={() => onPick(tf)}>
                <span className="tl-cap">{label}</span>{t && t !== 'error' && t.read ? <Dir d={t.read.dir} /> : <span className="tl-mtf-n">—</span>}
              </button>
            );
          })}
        </div>
      )}
      <button type="button" className="tl-mtf-x" onClick={toggle} aria-expanded={open} aria-label={open ? 'Collapse timeframes' : 'Expand timeframes'} data-testid="mtf-toggle">
        {open ? <CaretUp size={14} weight="bold" /> : <CaretDown size={14} weight="bold" />}
      </button>
    </section>
  );
}
