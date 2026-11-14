'use client';

// Replay (E): pick one of your recent trades on this symbol and play the
// candles through entry → exit and six hours after, so you see what price did
// once you were out ("left $199 on the table" / "exit saved $80").
import { useEffect, useMemo, useRef, useState } from 'react';
import { ClockCounterClockwise, Pause, Play, SkipBack, SkipForward } from '@phosphor-icons/react';
import { marketApi, type Candle, type MarketTimeframe } from '@/lib/market-api';
import { afterExit, money, px, verdict, type ChartTrade } from './trade-math';

const AFTER_MS = 6 * 3_600_000;
const TFS: Array<[MarketTimeframe, number]> = [['1m', 60e3], ['5m', 300e3], ['15m', 900e3], ['30m', 1800e3], ['1h', 3600e3], ['4h', 14400e3], ['1d', 86400e3]];
const SPEEDS = [1, 4, 16] as const;

interface Win { from: number; to: number; tf: MarketTimeframe; tfMs: number }
function windowFor(t: ChartTrade, now: number): Win | null {
  if (t.openTime == null) return null;
  const end = t.closeTime ? Math.min(now, t.closeTime + AFTER_MS) : now;
  const held = Math.max((t.closeTime ?? now) - t.openTime, 5 * 60e3);
  const pre = Math.max(held * 0.35, 30 * 60e3);
  const from = t.openTime - pre;
  const [tf, tfMs] = TFS.find(([, m]) => (end - from) / m <= 140) ?? TFS[TFS.length - 1]!;
  return { from, to: end, tf, tfMs };
}

const cache = new Map<string, Candle[] | 'error'>();

function useWindowBars(symbol: string, t: ChartTrade | null, now: number) {
  const w = t ? windowFor(t, now) : null;
  const key = t && w ? `${symbol}:${t.id}:${w.tf}:${t.closeTime ? 'c' : Math.floor(now / 60e3)}` : '';
  const [state, setState] = useState<{ key: string; bars: Candle[] | 'error' | null }>({ key: '', bars: null });
  useEffect(() => {
    if (!key || !w) return;
    const hit = cache.get(key);
    if (hit) { setState({ key, bars: hit }); return; }
    let alive = true;
    setState({ key, bars: null });
    marketApi.candles({ symbol, tf: w.tf, from: Math.floor(w.from / 1000), to: Math.ceil(w.to / 1000), limit: 500 })
      .then(({ candles }) => { const v = candles.length >= 2 ? candles : 'error' as const; cache.set(key, v); if (alive) setState({ key, bars: v }); })
      .catch(() => { if (alive) setState({ key, bars: 'error' }); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return { win: w, bars: state.key === key ? state.bars : null };
}

function Chip({ symbol, t, now, pv, ccy }: { symbol: string; t: ChartTrade; now: number; pv: number | null; ccy: string }) {
  const { win, bars } = useWindowBars(symbol, t.status === 'OPEN' ? null : t, now);
  if (t.status === 'OPEN') return <span className="tl-chip">Open</span>;
  if (!win || bars == null) return <span className="tl-chip x-muted">…</span>;
  const a = bars === 'error' ? null : afterExit(t, bars, win.to, pv);
  const v = verdict(t, a, n => money(n, ccy));
  return <span className={`tl-chip mny ${v.tone === 'pos' ? 'up' : v.tone === 'neg' ? 'dn' : ''}`}>{v.text}</span>;
}

function ReplayChart({ t, bars, head, win, ccy, dec }: { t: ChartTrade; bars: Candle[]; head: number; win: Win; ccy: string; dec: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(480);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setW(el.clientWidth));
    ro.observe(el);
    setW(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  const H = w < 420 ? 210 : 232, PR = 62, PT = 18, PB = 22, PL = 6;
  const lo0 = Math.min(...bars.map(b => b.low), t.entry, t.exit ?? t.entry);
  const hi0 = Math.max(...bars.map(b => b.high), t.entry, t.exit ?? t.entry);
  const pad = (hi0 - lo0) * 0.06 || 1;
  const lo = lo0 - pad, hi = hi0 + pad;
  const plotW = Math.max(40, w - PR - PL);
  const bw = plotW / bars.length;
  const X = (i: number) => PL + i * bw + bw / 2;
  const Y = (v: number) => PT + ((hi - v) / (hi - lo)) * (H - PT - PB);
  const idxAt = (time: number) => { let k = 0; for (let i = 0; i < bars.length; i++) if (bars[i]!.openTime <= time) k = i; return k; };
  const ei = t.openTime != null ? idxAt(t.openTime) : 0;
  const xi = t.closeTime != null ? idxAt(t.closeTime) : null;
  const shown = bars.slice(0, head + 1);
  const long = t.side === 'LONG';
  // Best price in the trade's favour after the exit, up to the playhead.
  const post = xi != null && head > xi ? bars.slice(xi + 1, head + 1) : [];
  const best = post.length ? (long ? Math.max(...post.map(b => b.high)) : Math.min(...post.map(b => b.low))) : null;
  const extra = best != null && t.exit != null ? Math.max(0, (best - t.exit) * (long ? 1 : -1)) : 0;
  const ticks = (() => { const span = hi - lo; const raw = span / 4; const mag = 10 ** Math.floor(Math.log10(raw)); const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => s >= raw) ?? raw; const out: number[] = []; for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) out.push(v); return out; })();
  const timeLbl = (ms: number) => { const d = new Date(ms); return win.tfMs >= 86400e3 ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); };
  const labelEvery = Math.max(1, Math.ceil(70 / bw));
  const took = t.netPnl != null ? `You took ${money(t.netPnl, ccy, true)}` : null;
  return (
    <div ref={ref} className="tl-rp-chart">
      <svg width={w} height={H} role="img" aria-label={`Replay of your ${long ? 'long' : 'short'} ${t.symbol}`}>
        {ticks.map(v => <g key={v}><line x1={PL} x2={PL + plotW} y1={Y(v)} y2={Y(v)} className="gl" /><text x={PL + plotW + 8} y={Y(v) + 4} className="ax">{px(v, dec)}</text></g>)}
        {xi != null && <><rect x={X(xi)} y={PT} width={Math.max(0, X(bars.length - 1) - X(xi) + bw / 2)} height={H - PT - PB} className="after" /><text x={X(xi) + 6} y={H - PB - 6} className="ax">after your exit</text></>}
        {bars.slice(head + 1).map((b, k) => { const i = head + 1 + k; return <line key={b.openTime} x1={X(i)} x2={X(i)} y1={Y(b.high)} y2={Y(b.low)} className="ghost" />; })}
        {shown.map((b, i) => {
          const up = b.close >= b.open;
          const top = Y(Math.max(b.open, b.close));
          return <g key={b.openTime} className={up ? 'u' : 'd'}><line x1={X(i)} x2={X(i)} y1={Y(b.high)} y2={Y(b.low)} /><rect x={X(i) - bw * 0.32} width={Math.max(1, bw * 0.64)} y={top} height={Math.max(1, Y(Math.min(b.open, b.close)) - top)} /></g>;
        })}
        {head >= ei && (
          <>
            <path d={long ? `M${X(ei)},${Y(t.entry) + 6}l-5.5,9h11z` : `M${X(ei)},${Y(t.entry) - 6}l-5.5,-9h11z`} className="tri" />
            {took && <text x={Math.max(PL + 4, X(ei) - 10)} y={long ? Y(t.entry) + 30 : Y(t.entry) - 22} className={`lbl mny ${t.netPnl! >= 0 ? 'pos' : 'neg'}`}>{took}</text>}
          </>
        )}
        {xi != null && t.exit != null && head >= xi && (
          <>
            <line x1={X(ei)} x2={X(xi)} y1={Y(t.entry)} y2={Y(t.exit)} className="conn" />
            <circle cx={X(xi)} cy={Y(t.exit)} r={3.5} className="exit" />
            <line x1={X(xi)} x2={X(head) + 6} y1={Y(t.exit)} y2={Y(t.exit)} className="exitln" />
          </>
        )}
        {best != null && extra > 0 && t.exit != null && (() => {
          const xb = Math.min(PL + plotW - 8, X(head) + 12);
          return (
            <g className="brk">
              <line x1={X(xi! + 1)} x2={xb + 4} y1={Y(best)} y2={Y(best)} className="bestln" />
              <path d={`M${xb},${Y(t.exit)}V${Y(best)}M${xb - 4},${Y(t.exit)}h8M${xb - 4},${Y(best)}h8`} />
              <text x={xb - 6} y={(Y(t.exit) + Y(best)) / 2 + 4} textAnchor="end" className="lbl pos">+{px(extra, dec)}</text>
            </g>
          );
        })()}
        <line x1={X(head)} x2={X(head)} y1={PT} y2={H - PB} className="head" />
        <rect x={X(head) - 4} y={H - PB - 4} width={8} height={8} className="headk" />
        {best != null && extra > 0 && <g><rect x={PL + plotW + 2} y={Y(best) - 9} width={PR - 4} height={18} rx={4} className="tagu" /><text x={PL + plotW + 7} y={Y(best) + 4} className="tagt pos">{px(best, dec)}</text></g>}
        {t.exit != null && xi != null && head >= xi && <g><rect x={PL + plotW + 2} y={Y(t.exit) - 9} width={PR - 4} height={18} rx={4} className="tagn" /><text x={PL + plotW + 7} y={Y(t.exit) + 4} className="tagt">X {px(t.exit, dec)}</text></g>}
        {bars.map((b, i) => ((bars.length - 1 - i) % labelEvery === 0 && X(i) > 30 && X(i) < PL + plotW - 20 ? <text key={`t${b.openTime}`} x={X(i)} y={H - 6} textAnchor="middle" className="ax">{timeLbl(b.openTime)}</text> : null))}
      </svg>
    </div>
  );
}

export default function ReplayPanel({ symbol, trades, ccy, pointValue, loading, decimals, error }: { symbol: string; trades: ChartTrade[]; ccy: string; pointValue: number | null; loading: boolean; decimals: number; error?: string | null }) {
  const [now] = useState(() => Date.now());
  const rows = useMemo(() => trades
    .filter(t => t.openTime != null && (t.status === 'OPEN' || t.closeTime != null))
    .sort((a, b) => (b.closeTime ?? b.openTime ?? now) - (a.closeTime ?? a.openTime ?? now))
    .slice(0, 5), [trades, now]);
  const [sel, setSel] = useState<string | null>(null);
  const cur = rows.find(r => r.id === sel) ?? rows.find(r => r.status === 'CLOSED') ?? rows[0] ?? null;
  const { win, bars } = useWindowBars(symbol, cur, now);
  const list = Array.isArray(bars) ? bars : null;
  const [head, setHead] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof SPEEDS)[number]>(4);
  // New trade → show it whole; Play starts from just before the entry.
  useEffect(() => { setPlaying(false); setHead(list ? list.length - 1 : 0); }, [cur?.id, list]);
  useEffect(() => {
    if (!playing || !list) return;
    const t = setInterval(() => setHead(h => { const n = Math.min(list.length - 1, h + speed); if (n >= list.length - 1) setPlaying(false); return n; }), 260);
    return () => clearInterval(t);
  }, [playing, speed, list]);
  const play = () => {
    if (!list || !cur) return;
    if (!playing && head >= list.length - 1) {
      const ei = list.findIndex(b => cur.openTime != null && b.openTime + (win?.tfMs ?? 0) > cur.openTime);
      setHead(Math.max(0, ei - 3));
    }
    setPlaying(p => !p);
  };
  const a = cur && win && list ? afterExit(cur, list, win.to, pointValue) : null;
  const stamp = list?.[head] ? new Date(list[head]!.openTime).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : '';

  return (
    <section className="tl-card tl-w tl-rp" aria-label="Replay" data-testid="replay-panel">
      <header className="tl-wh">
        <h2>Replay</h2><span className="tl-st">· your trade, then what price did</span>
        <div className="tl-r">{rows.length > 0 && <span className="tl-chip"><ClockCounterClockwise size={12} aria-hidden />{rows.length} trade{rows.length === 1 ? '' : 's'}</span>}</div>
      </header>
      <div className="tl-wb">
        {loading && !rows.length ? <div className="x-skel" style={{ height: 220 }} />
          : error && !rows.length ? <p className="tl-empty"><span>Your trades didn&rsquo;t load: {error}</span></p>
          : !rows.length ? <p className="tl-empty" data-testid="replay-empty"><b>Nothing to replay yet.</b><span>Once you&rsquo;ve traded {symbol}, replay any trade here and see what price did after you got out.</span></p>
            : (
              <div className="tl-rp-grid">
                <div className="tl-rp-main">
                  {bars == null ? <div className="x-skel" style={{ height: 232 }} />
                    : bars === 'error' || !cur || !win ? <p className="tl-empty"><span>No {symbol} candles for this trade&rsquo;s window.</span></p>
                      : <ReplayChart t={cur} bars={bars} head={Math.min(head, bars.length - 1)} win={win} ccy={ccy} dec={decimals} />}
                  <div className="tl-rc">
                    <button type="button" onClick={() => { setPlaying(false); setHead(0); }} aria-label="Back to start" disabled={!list}><SkipBack size={16} /></button>
                    <button type="button" className="tl-play" onClick={play} aria-label={playing ? 'Pause' : 'Play'} disabled={!list} data-testid="replay-play">{playing ? <Pause size={14} weight="fill" /> : <Play size={14} weight="fill" />}</button>
                    <button type="button" onClick={() => { setPlaying(false); setHead(list ? list.length - 1 : 0); }} aria-label="To the end" disabled={!list}><SkipForward size={16} /></button>
                    <div className="tl-seg" role="group" aria-label="Speed">{SPEEDS.map(s => <button key={s} type="button" aria-pressed={speed === s} onClick={() => setSpeed(s)}>{s}×</button>)}</div>
                    <input type="range" className="tl-scrub" min={0} max={list ? list.length - 1 : 0} value={Math.min(head, list ? list.length - 1 : 0)} onChange={e => { setPlaying(false); setHead(Number(e.target.value)); }} aria-label="Replay position" disabled={!list} />
                    <span className="tl-lbl m">{stamp}</span>
                  </div>
                  {a && a.leftMoney != null && cur?.status === 'CLOSED' && a.extra > 0 && <p className="tl-one"><span>Price ran {px(a.extra, decimals)} further after your exit: <b className="mny pos">{money(a.leftMoney, ccy)}</b> left on the table.</span></p>}
                </div>
                <div className="tl-rl" role="listbox" aria-label="Your recent trades">
                  {rows.map(t => (
                    <button key={t.id} type="button" role="option" aria-selected={t.id === cur?.id} className={`tl-rr ${t.id === cur?.id ? 'on' : ''}`} onClick={() => setSel(t.id)}>
                      <span className="tl-rr-l">
                        <b>{t.side === 'LONG' ? 'Long' : 'Short'} <small className="m">{t.openTime ? new Date(t.closeTime ?? t.openTime).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</small></b>
                        <Chip symbol={symbol} t={t} now={now} pv={pointValue} ccy={ccy} />
                      </span>
                      {t.netPnl != null && <span className={`tl-n14 mny ${t.netPnl < 0 ? 'neg' : 'pos'}`}>{money(t.netPnl, ccy, true)}</span>}
                    </button>
                  ))}
                </div>
              </div>
            )}
      </div>
    </section>
  );
}
