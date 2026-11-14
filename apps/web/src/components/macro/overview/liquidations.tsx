'use client';

// BTC liquidation ladder + max-pain board. Every number is a MODEL estimate
// from the liquidations API (OI × leverage tiers), labelled "Estimated". When
// the API is down or empty the blocks fall back to a quiet unavailable state.
import { useCallback, useEffect, useState } from 'react';
import { liquidationsApi, type LiquidationMap, type MaxPainBoard, type MaxPainRow } from '@/lib/liquidations-api';
import { AiLine, Quiet, SecHead, lin, pt, useWidth } from './parts';
import { liqSourceLabel, magnetLine, num, signed, usdShort } from './format';

type Load<T> = { status: 'loading' } | { status: 'error' } | { status: 'ok'; data: T };

export function useLiquidations() {
  const [map, setMap] = useState<Load<LiquidationMap>>({ status: 'loading' });
  const [board, setBoard] = useState<Load<MaxPainBoard>>({ status: 'loading' });
  const load = useCallback(() => {
    setMap({ status: 'loading' });
    setBoard({ status: 'loading' });
    liquidationsApi.map('BTC', '48h')
      .then(data => setMap(data && data.bands?.length ? { status: 'ok', data } : { status: 'error' }))
      .catch(() => setMap({ status: 'error' }));
    liquidationsApi.maxPain()
      .then(data => setBoard(data && data.rows?.length ? { status: 'ok', data } : { status: 'error' }))
      .catch(() => setBoard({ status: 'error' }));
  }, []);
  useEffect(() => { load(); }, [load]);
  return { map, board, reload: load };
}

const k = (p: number) => (p >= 10_000 ? `${(p / 1000).toFixed(p >= 100_000 ? 0 : 1)}k` : num(p, p < 10 ? 3 : p < 1000 ? 2 : 0));
const timeLabel = (iso: string) => {
  const d = new Date(iso);
  return `${d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'UTC' })}`;
};

/** Merge adjacent bands so the ladder has at most `max` bars. */
function coarsen(bands: LiquidationMap['bands'], max: number) {
  if (bands.length <= max) return bands;
  const g = Math.ceil(bands.length / max);
  const out: LiquidationMap['bands'] = [];
  for (let i = 0; i < bands.length; i += g) {
    const grp = bands.slice(i, i + g);
    out.push({
      price: grp.reduce((s, b) => s + b.price, 0) / grp.length,
      longUsd: grp.reduce((s, b) => s + b.longUsd, 0),
      shortUsd: grp.reduce((s, b) => s + b.shortUsd, 0),
    });
  }
  return out;
}

function Ladder({ m, w }: { m: LiquidationMap; w: number }) {
  const compact = w < 560;
  const h = compact ? 420 : 470;
  const pt0 = 16, pb = 24, pl = 4, axw = 54;
  const mp = m.maxPain;
  const pathP = m.path.map(p => p.p);
  const want = [m.price, ...(compact ? [] : pathP), ...(mp.longUsd > 0 ? [mp.longPrice] : []), ...(mp.shortUsd > 0 ? [mp.shortPrice] : [])];
  let lo = Math.min(...want) * 0.985;
  let hi = Math.max(...want) * 1.015;
  const bLo = m.bands[0]!.price;
  const bHi = m.bands[m.bands.length - 1]!.price;
  lo = Math.max(lo, bLo);
  hi = Math.min(hi, bHi);
  if (hi <= lo) { lo = bLo; hi = bHi; }
  const Y = lin(lo, hi, h - pb, pt0);
  const chartW = compact ? 0 : Math.round((w - axw) * 0.5);
  const ladX = pl + chartW + (compact ? 0 : 16);
  const ladW = Math.max(40, w - axw - ladX - 6);
  const visible = coarsen(m.bands.filter(b => b.price >= lo && b.price <= hi), compact ? 60 : 80);
  const val = (b: { price: number; longUsd: number; shortUsd: number }) => (b.price < m.price ? b.longUsd : b.shortUsd);
  const maxV = Math.max(1, ...visible.map(val));
  const step = visible.length > 1 ? Math.abs(visible[1]!.price - visible[0]!.price) : m.step;
  const bw = Math.max(1.5, Math.abs(Y(lo) - Y(lo + step)) * 0.74);
  const strong = maxV * 0.5;

  // Price grid lines: ~6 round levels.
  const raw = (hi - lo) / 6;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const gstep = [1, 2, 2.5, 5, 10].map(x => x * mag).find(x => x >= raw) ?? raw;
  const grid: number[] = [];
  for (let p = Math.ceil(lo / gstep) * gstep; p <= hi; p += gstep) grid.push(p);

  const labelX = compact ? ladX + ladW * 0.36 : ladX + ladW * 0.5;
  const painLine = (price: number, usd: number, pct: number, side: 'long' | 'short') => {
    if (usd <= 0 || price < lo || price > hi) return null;
    const y = Y(price);
    // Long labels sit under their line, short labels above, unless that runs
    // off the plot; then they flip to the other side.
    let below = side === 'long';
    if (below && y + 34 > h - pb) below = false;
    if (!below && y - 22 < pt0) below = true;
    return (
      <g key={side}>
        <line x1={pl} x2={w - axw} y1={y} y2={y} className={side === 'long' ? 'mo-pain-l' : 'mo-pain-s'} />
        <text x={labelX} y={y + (below ? 16 : -18)} className={`mo-t11 mo-halo ${side === 'long' ? 'mo-txd' : 'mo-txu'}`} fontWeight={700}>{side === 'long' ? 'Long' : 'Short'} max pain {num(price)}</text>
        <text x={labelX} y={y + (below ? 30 : -5)} className="mo-t11 mo-tx2 mo-halo">≈{usdShort(usd)} · {signed(pct, 2)}%</text>
      </g>
    );
  };

  const yn = Y(m.price);
  const Xp = lin(0, Math.max(1, pathP.length - 1), pl, pl + chartW);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={`${m.coin} estimated liquidation ladder around ${num(m.price)}: long max pain ${num(mp.longPrice)}, short max pain ${num(mp.shortPrice)}`}>
      {grid.map(p => (
        <g key={p}>
          <line x1={pl} x2={w - axw} y1={Y(p)} y2={Y(p)} className="mo-gl" />
          {Math.abs(Y(p) - Y(m.price)) > 16 && <text x={w - axw + 8} y={Y(p) + 4} className="mo-t11 mo-tx3">{k(p)}</text>}
        </g>
      ))}
      {!compact && pathP.length > 1 && (
        <>
          <path d={'M' + pathP.map((v, i) => pt(Xp(i), Y(Math.max(lo, Math.min(hi, v))))).join('L')} className="mo-ln" />
          <text x={pl} y={h - 6} className="mo-t11 mo-tx3">{timeLabel(m.path[0]!.t)}</text>
          {chartW > 260 && <text x={pl + chartW / 2} y={h - 6} textAnchor="middle" className="mo-t11 mo-tx3">{timeLabel(m.path[Math.floor((m.path.length - 1) / 2)]!.t)}</text>}
          <text x={pl + chartW} y={h - 6} textAnchor="end" className="mo-t11 mo-tx3">Now</text>
        </>
      )}
      {visible.map(b => {
        const v = val(b);
        if (v <= 0) return null;
        const len = Math.max(1, (v / maxV) * ladW);
        return <rect key={b.price} x={ladX} y={Y(b.price) - bw / 2} width={len} height={bw} className={b.price < m.price ? 'mo-fd' : 'mo-fu'} opacity={v >= strong ? 1 : 0.5} />;
      })}
      {!compact && <text x={ladX} y={h - 6} className="mo-t11 mo-tx3">Liquidations per {usdShort(m.step)}, est.</text>}
      {painLine(mp.longPrice, mp.longUsd, mp.longPct, 'long')}
      {painLine(mp.shortPrice, mp.shortUsd, mp.shortPct, 'short')}
      <line x1={pl} x2={w - axw} y1={yn} y2={yn} className="mo-now" />
      <rect x={w - axw + 2} y={yn - 10} width={axw - 2} height={20} rx={3} className="mo-fi" />
      <text x={w - axw / 2 + 1} y={yn + 4} textAnchor="middle" className="mo-t11 mo-inv" fontWeight={900}>{k(m.price)}</text>
    </svg>
  );
}

export function LiqLadder({ state, onRetry }: { state: Load<LiquidationMap>; onRetry: () => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const m = state.status === 'ok' ? state.data : null;
  const line = m ? magnetLine(m.maxPain.longPct, m.maxPain.shortPct, m.maxPain.longUsd, m.maxPain.shortUsd) : null;
  return (
    <div ref={ref} data-testid="macro-liq-ladder">
      <SecHead title="BTC liquidation ladder" est sub="48h price, liquidity on the same axis" />
      {state.status === 'loading' && <div className="x-skel mo-sk-ladder" aria-label="Loading liquidation estimate" />}
      {state.status === 'error' && <Quiet onRetry={onRetry}>Liquidation estimate unavailable right now.</Quiet>}
      {m && w > 0 && <Ladder m={m} w={w} />}
      {m && line && <div className="mo-mt12"><AiLine text={line} detail={liqSourceLabel(m.sources)} /></div>}
    </div>
  );
}

function PainTrack({ r, w }: { r: MaxPainRow; w: number }) {
  const range = 4.5;
  const h = 36;
  const X = lin(-range, range, 8, w - 8);
  const y = h / 2 + 4;
  const clampP = (p: number) => Math.max(-range, Math.min(range, p));
  const rad = (usd: number) => 3 + Math.min(7, Math.sqrt(Math.max(0, usd) / 1e6) * 0.33);
  const hasL = r.longUsd > 0;
  const hasS = r.shortUsd > 0;
  const lx = X(clampP(r.longPct));
  const sx = X(clampP(r.shortPct));
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img"
      aria-label={`${r.coin}: long pain ${signed(r.longPct, 2)}%, short pain ${signed(r.shortPct, 2)}%`}>
      <line x1={8} x2={w - 8} y1={y} y2={y} className="mo-ax" />
      <rect x={X(-1)} y={y - 7} width={X(1) - X(-1)} height={14} rx={2} className="mo-track" />
      {hasL && <line x1={lx} x2={X(0)} y1={y} y2={y} className="mo-pt-l" />}
      {hasS && <line x1={X(0)} x2={sx} y1={y} y2={y} className="mo-pt-s" />}
      {hasL && <circle cx={lx} cy={y} r={rad(r.longUsd)} className="mo-fd" />}
      {hasS && <circle cx={sx} cy={y} r={rad(r.shortUsd)} className="mo-fu" />}
      <line x1={X(0)} x2={X(0)} y1={y - 9} y2={y + 9} className="mo-now" />
      {hasL && <text x={Math.max(22, lx)} y={y - 12} textAnchor="middle" className="mo-t11 mo-txd" fontWeight={600}>{signed(r.longPct, 2)}%</text>}
      {hasS && <text x={Math.min(w - 22, sx)} y={y - 12} textAnchor="middle" className="mo-t11 mo-txu" fontWeight={600}>{signed(r.shortPct, 2)}%</text>}
    </svg>
  );
}

function PainScale({ w }: { w: number }) {
  const X = lin(-4.5, 4.5, 8, w - 8);
  const ticks = w < 200 ? [-4, 0, 4] : [-4, -2, 0, 2, 4];
  return (
    <svg width={w} height={16} viewBox={`0 0 ${w} 16`} aria-hidden>
      {ticks.map(t => (
        <text key={t} x={X(t)} y={12} textAnchor="middle" className="mo-t11 mo-tx3">{t === 0 ? 'price' : `${t > 0 ? '+' : '−'}${Math.abs(t)}%`}</text>
      ))}
    </svg>
  );
}

const touch = (r: { touchDownPct: number | null; touchUpPct: number | null }) => {
  const d = r.touchDownPct;
  const u = r.touchUpPct;
  if (d == null && u == null) return null;
  const down = (d ?? -1) >= (u ?? -1);
  return { pct: Math.round(down ? d! : u!), down };
};

export function MaxPainBlock({ board, map, onRetry }: { board: Load<MaxPainBoard>; map: Load<LiquidationMap>; onRetry: () => void }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const rows = board.status === 'ok' ? board.data.rows : [];
  const btc = rows.find(r => r.coin === 'BTC') ?? null;
  const m = map.status === 'ok' ? map.data : null;
  const head = btc ?? (m ? { ...m.maxPain, price: m.price, coin: 'BTC' as const } : null);
  const t = head ? touch(head) : null;
  const trackW = Math.max(120, w - 52 - 64);

  return (
    <div ref={ref} data-testid="macro-max-pain">
      <SecHead title="Max pain" est sub="24h, per coin" />
      {board.status === 'loading' && !head && <div className="x-skel mo-sk-pain" aria-label="Loading max pain" />}
      {board.status === 'error' && !head && <Quiet onRetry={onRetry}>Max pain estimate unavailable right now.</Quiet>}
      {head && (
        <div className="mo-mp4">
          <div><div className="mo-cap">Long pain · BTC</div><div className="mo-mp-v m neg">{head.longUsd > 0 ? num(head.longPrice) : '–'}</div><div className="mo-mp-s m">{head.longUsd > 0 ? `≈${usdShort(head.longUsd)} · ${signed(head.longPct, 2)}%` : 'nothing resting below'}</div></div>
          <div><div className="mo-cap">Short pain · BTC</div><div className="mo-mp-v m pos">{head.shortUsd > 0 ? num(head.shortPrice) : '–'}</div><div className="mo-mp-s m">{head.shortUsd > 0 ? `≈${usdShort(head.shortUsd)} · ${signed(head.shortPct, 2)}%` : 'nothing resting above'}</div></div>
          <div><div className="mo-cap">Touch, 24h</div><div className="mo-mp-v m">{t ? `${t.pct}%` : '–'}</div><div className="mo-mp-s">{t ? `${t.down ? 'down' : 'up'} side first` : 'no volatility read'}</div></div>
          {m?.lastHour ? (
            <div><div className="mo-cap">Liq. last hour</div><div className="mo-mp-v m">{usdShort(m.lastHour.totalUsd)}</div><div className="mo-mp-s m">{Math.round(m.lastHour.longShare * 100)}% longs</div></div>
          ) : (
            <div><div className="mo-cap">BTC price</div><div className="mo-mp-v m">{num(head.price)}</div><div className="mo-mp-s">no live liquidation feed</div></div>
          )}
        </div>
      )}
      {rows.length > 0 && w > 0 && (
        <table className="mo-ptab">
          <colgroup><col style={{ width: 52 }} /><col /><col style={{ width: 64 }} /></colgroup>
          <thead><tr><th scope="col">Coin</th><th scope="col"><PainScale w={trackW} /></th><th scope="col" className="mo-ptab-o">Touch 24h</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const tt = touch(r);
              return (
                <tr key={r.coin}>
                  <th scope="row">{r.coin}</th>
                  <td><PainTrack r={r} w={trackW} /></td>
                  <td className={`mo-ptab-o m ${tt && tt.down && tt.pct > 50 ? 'neg' : ''}`}>{tt ? `${tt.pct}%` : '–'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      {board.status === 'error' && head && <p className="mo-note">Per-coin board unavailable right now.</p>}
    </div>
  );
}
