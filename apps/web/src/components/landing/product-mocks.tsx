'use client';

// Live product mocks for the landing page — the actual app UI rendered as DOM/SVG
// (not screenshots), so they stay razor-sharp at any resolution, weigh ~nothing,
// and match the obsidian theme exactly. Each mock is authored at a fixed design
// size and scaled to fit its frame by <ScaledMock>, so it behaves like an image
// (fixed aspect ratio, scales down) while remaining vector-crisp.
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Gauge, Table, ChartLineUp, CalendarDots, Newspaper, Robot, GearSix, Bank, type Icon } from '@phosphor-icons/react';

const W = 1000;
const H = 640;

// Run before paint on the client (no visible flash), fall back to useEffect on the server.
const useIsoLayoutEffect = typeof window !== 'undefined' ? useLayoutEffect : useEffect;

/** Scale a fixed-size mock to fit its container width, keeping it vector-crisp. */
export function ScaledMock({ w = W, h = H, children }: { w?: number; h?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setScale(el.clientWidth / w);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w]);
  return (
    <div ref={ref} className="relative w-full overflow-hidden" style={{ aspectRatio: `${w} / ${h}` }}>
      <div
        className="absolute top-0 left-0 select-none"
        style={{ width: w, height: h, transform: `scale(${scale || 0.001})`, transformOrigin: 'top left', visibility: scale ? 'visible' : 'hidden' }}
      >
        {children}
      </div>
    </div>
  );
}

// ── Shared bits ──────────────────────────────────────────────────────────────

const NAV: { label: string; icon: Icon; active?: boolean }[] = [
  { label: 'Dashboard', icon: Gauge, active: true },
  { label: 'Trade Log', icon: Table },
  { label: 'Analytics', icon: ChartLineUp },
  { label: 'Calendar', icon: CalendarDots },
  { label: 'Markets', icon: Newspaper },
  { label: 'AI Coach', icon: Robot },
  { label: 'Brokers', icon: Bank },
  { label: 'Settings', icon: GearSix },
];

function Sidebar({ active = 'Dashboard' }: { active?: string }) {
  return (
    <aside className="w-[188px] shrink-0 h-full border-r border-border bg-app flex flex-col py-4 px-3">
      <div className="flex items-center gap-1.5 px-2 mb-6">
        <span className="font-display font-black text-[16px] tracking-tight text-fg">TRADE<span className="text-profit">logs</span></span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {NAV.map(n => {
          const on = n.label === active;
          const I = n.icon;
          return (
            <div key={n.label} className={`flex items-center gap-2.5 px-2.5 py-[7px] rounded-md text-[11.5px] tracking-wide ${on ? 'bg-profit/12 text-fg' : 'text-fg-3'}`}>
              <I size={14} weight={on ? 'fill' : 'regular'} className={on ? 'text-profit' : 'text-fg-3'} />
              {n.label}
              {on && <span className="ml-auto w-1 h-1 rounded-full bg-profit" />}
            </div>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-2 rounded-lg border border-border-soft bg-surface/50 px-2.5 py-2">
        <span className="w-6 h-6 rounded-full bg-profit/15 text-profit text-[10px] font-bold flex items-center justify-center">RS</span>
        <div className="min-w-0">
          <div className="text-[10.5px] text-fg-2 truncate">XM Global</div>
          <div className="text-[9px] text-fg-3 numeric">#336225</div>
        </div>
      </div>
    </aside>
  );
}

function TopBar({ title, sub }: { title: string; sub: string }) {
  return (
    <header className="h-12 shrink-0 border-b border-border-soft flex items-center gap-3 px-5">
      <div>
        <div className="font-display font-bold text-[14px] tracking-tight text-fg leading-none">{title}</div>
        <div className="text-[8.5px] tracking-[0.2em] text-fg-3 mt-1">{sub}</div>
      </div>
      <div className="ml-auto flex items-center gap-3 text-[10px] text-fg-3">
        <span className="tracking-[0.16em]">29 JUL 2026</span>
        <span className="flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-profit" /> LIVE</span>
      </div>
    </header>
  );
}

// Rising equity curve as an SVG path (viewBox 720×200).
function EquityCurve({ height = 200 }: { height?: number }) {
  const line = 'M0,182 L52,176 L104,168 L156,170 L208,150 L260,138 L312,144 L364,118 L416,104 L468,92 L520,96 L572,72 L624,58 L676,44 L720,30';
  return (
    <svg viewBox={`0 0 720 200`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <defs>
        <linearGradient id="eq-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#08C465" stopOpacity="0.28" />
          <stop offset="100%" stopColor="#08C465" stopOpacity="0" />
        </linearGradient>
      </defs>
      {[40, 90, 140, 190].map(y => <line key={y} x1="0" y1={y} x2="720" y2={y} stroke="#1E1E1E" strokeWidth="1" strokeDasharray="3 4" />)}
      <path d={`${line} L720,200 L0,200 Z`} fill="url(#eq-fill)" />
      <path d={line} fill="none" stroke="#08C465" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="720" cy="30" r="4" fill="#08C465" />
    </svg>
  );
}

function StatCard({ label, value, accent, children }: { label: string; value: string; accent?: 'profit' | 'fg'; children?: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border-soft bg-surface/40 p-3.5">
      <div className="text-[9px] tracking-[0.18em] uppercase text-fg-3">{label}</div>
      <div className={`font-display font-black text-[22px] tracking-tight mt-1.5 numeric ${accent === 'profit' ? 'text-profit' : 'text-fg'}`}>{value}</div>
      <div className="mt-2.5 h-6">{children}</div>
    </div>
  );
}

// ── Dashboard mock ───────────────────────────────────────────────────────────

export function DashboardMock() {
  return (
    <ScaledMock>
      <div className="w-full h-full flex bg-app text-fg font-sans">
        <Sidebar active="Dashboard" />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar title="Dashboard" sub="// OVERVIEW" />
          <div className="flex-1 p-5 flex flex-col gap-4 min-h-0">
            <div className="grid grid-cols-4 gap-3">
              <StatCard label="Net P&L" value="+$45,230" accent="profit">
                <div className="flex items-end gap-[3px] h-full">
                  {[8, 12, 7, 14, 11, 17, 13, 20, 18, 24].map((v, i) => <span key={i} className="flex-1 rounded-sm bg-profit/50" style={{ height: `${v * 3.5}%` }} />)}
                </div>
              </StatCard>
              <StatCard label="Win Rate" value="67%">
                <div className="w-full h-1.5 rounded-full bg-surface-active overflow-hidden mt-1.5"><span className="block h-full bg-profit/80" style={{ width: '67%' }} /></div>
              </StatCard>
              <StatCard label="Profit Factor" value="2.40">
                <svg viewBox="0 0 24 24" className="h-6 w-6"><circle cx="12" cy="12" r="9" fill="none" stroke="#222" strokeWidth="3" /><circle cx="12" cy="12" r="9" fill="none" stroke="#08C465" strokeWidth="3" strokeDasharray="42 57" strokeLinecap="round" transform="rotate(-90 12 12)" /></svg>
              </StatCard>
              <StatCard label="Total Trades" value="248">
                <div className="flex items-center gap-1 mt-1.5"><span className="text-[10px] text-profit numeric">166 W</span><span className="w-px h-3 bg-border" /><span className="text-[10px] text-loss numeric">82 L</span></div>
              </StatCard>
            </div>
            <div className="rounded-[var(--radius-card)] border border-border-soft bg-surface/40 p-4 flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between">
                <div className="text-[12px] font-semibold text-fg">Performance Over Time</div>
                <div className="flex items-center gap-1.5">
                  {['1M', '3M', 'YTD', 'ALL'].map((r, i) => <span key={r} className={`px-2 py-0.5 rounded text-[9px] tracking-wide ${i === 3 ? 'bg-profit/15 text-fg' : 'text-fg-3'}`}>{r}</span>)}
                </div>
              </div>
              <div className="flex-1 flex items-end mt-2"><EquityCurve height={180} /></div>
            </div>
          </div>
        </div>
      </div>
    </ScaledMock>
  );
}

// ── Analytics mock ───────────────────────────────────────────────────────────

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-border-soft bg-surface/40 p-3.5 flex flex-col min-h-0">
      <div className="text-[11px] font-semibold text-fg-2 mb-2.5">{title}</div>
      <div className="flex-1 min-h-0">{children}</div>
    </div>
  );
}

const SYMBOLS: { s: string; pnl: number; w: number }[] = [
  { s: 'XAUUSD', pnl: 18240, w: 100 },
  { s: 'BTCUSD', pnl: 11350, w: 72 },
  { s: 'US500', pnl: 6820, w: 48 },
  { s: 'EURUSD', pnl: 3110, w: 30 },
  { s: 'GBPUSD', pnl: -1980, w: -22 },
  { s: 'USDJPY', pnl: -3240, w: -34 },
];

export function AnalyticsMock() {
  return (
    <ScaledMock>
      <div className="w-full h-full flex bg-app text-fg font-sans">
        <Sidebar active="Analytics" />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar title="Analytics" sub="// EVERY ANGLE OF YOUR EDGE" />
          <div className="flex-1 p-4 grid grid-cols-2 grid-rows-2 gap-3 min-h-0">
            <Panel title="Equity Curve">
              <div className="h-full flex items-end"><EquityCurve height={150} /></div>
            </Panel>
            <Panel title="P&L by Symbol">
              <div className="flex flex-col gap-2 justify-center h-full">
                {SYMBOLS.map(r => (
                  <div key={r.s} className="flex items-center gap-2 text-[10px]">
                    <span className="w-12 text-fg-3 numeric">{r.s}</span>
                    <div className="flex-1 h-2.5 relative flex items-center">
                      <div className="absolute left-1/2 w-px h-full bg-border" />
                      <span className={`absolute h-2.5 rounded-sm ${r.w >= 0 ? 'left-1/2 bg-profit/70' : 'right-1/2 bg-loss/70'}`} style={{ width: `${Math.abs(r.w) / 2}%` }} />
                    </div>
                    <span className={`w-14 text-right numeric ${r.pnl >= 0 ? 'text-profit' : 'text-loss'}`}>{r.pnl >= 0 ? '+' : '−'}${Math.abs(r.pnl).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Win Rate">
              <div className="h-full flex items-center justify-center gap-5">
                <svg viewBox="0 0 42 42" className="h-24 w-24">
                  <circle cx="21" cy="21" r="15.9" fill="none" stroke="#222" strokeWidth="5" />
                  <circle cx="21" cy="21" r="15.9" fill="none" stroke="#08C465" strokeWidth="5" strokeDasharray="67 33" strokeDashoffset="25" strokeLinecap="round" />
                </svg>
                <div>
                  <div className="font-display font-black text-[26px] text-fg numeric leading-none">67%</div>
                  <div className="text-[10px] text-fg-3 mt-1">166W · 82L</div>
                  <div className="text-[10px] text-fg-3 mt-2">Profit factor <span className="text-profit numeric">2.40</span></div>
                </div>
              </div>
            </Panel>
            <Panel title="P&L by Day">
              <div className="h-full flex items-end justify-between gap-2 pt-2">
                {[{ d: 'Mon', v: 62, up: true }, { d: 'Tue', v: 40, up: true }, { d: 'Wed', v: 28, up: false }, { d: 'Thu', v: 78, up: true }, { d: 'Fri', v: 52, up: true }].map(b => (
                  <div key={b.d} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <span className={`w-full rounded-t-sm ${b.up ? 'bg-profit/70' : 'bg-loss/70'}`} style={{ height: `${b.v}%` }} />
                    <span className="text-[9px] text-fg-3">{b.d}</span>
                  </div>
                ))}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </ScaledMock>
  );
}

// ── Chart replay mock ────────────────────────────────────────────────────────

// Deterministic candle series (green/red) with an entry + exit marker.
const CANDLES = [
  { o: 60, c: 72, h: 78, l: 55 }, { o: 72, c: 68, h: 80, l: 63 }, { o: 68, c: 82, h: 88, l: 66 },
  { o: 82, c: 79, h: 90, l: 74 }, { o: 79, c: 92, h: 98, l: 77 }, { o: 92, c: 88, h: 100, l: 84 },
  { o: 88, c: 76, h: 92, l: 72 }, { o: 76, c: 84, h: 90, l: 70 }, { o: 84, c: 100, h: 108, l: 82 },
  { o: 100, c: 112, h: 120, l: 96 }, { o: 112, c: 106, h: 122, l: 102 }, { o: 106, c: 120, h: 128, l: 104 },
  { o: 120, c: 134, h: 140, l: 116 }, { o: 134, c: 128, h: 144, l: 124 }, { o: 128, c: 142, h: 150, l: 125 },
  { o: 142, c: 156, h: 164, l: 138 }, { o: 156, c: 150, h: 166, l: 146 }, { o: 150, c: 138, h: 156, l: 133 },
  { o: 138, c: 148, h: 154, l: 132 }, { o: 148, c: 164, h: 172, l: 144 }, { o: 164, c: 158, h: 174, l: 152 },
  { o: 158, c: 170, h: 178, l: 154 },
];

export function ChartReplayMock() {
  const CW = 720, CH = 300, step = CW / CANDLES.length, bw = step * 0.55;
  const y = (v: number) => CH - ((v - 40) / 150) * CH; // map price→y
  return (
    <ScaledMock>
      <div className="w-full h-full flex bg-app text-fg font-sans">
        <Sidebar active="Trade Log" />
        <div className="flex-1 flex flex-col min-w-0">
          <TopBar title="Chart Replay" sub="// BAR-BY-BAR PLAYBACK" />
          <div className="flex-1 p-4 flex flex-col min-h-0">
            <div className="flex items-center gap-3 mb-3">
              <span className="font-display font-bold text-[15px] text-fg numeric">XAUUSD</span>
              <span className="text-[11px] text-fg-3">1H</span>
              <span className="text-[13px] text-profit numeric font-semibold">4,072.40</span>
              <span className="text-[10px] text-profit numeric">+1.84%</span>
              <span className="ml-auto flex items-center gap-1.5 text-[10px] text-fg-3"><span className="px-1.5 py-0.5 rounded bg-profit/12 text-profit">LONG</span> Entry → Exit</span>
            </div>
            <div className="flex-1 rounded-[var(--radius-card)] border border-border-soft bg-surface/30 p-3 flex min-h-0">
              <svg viewBox={`0 0 ${CW} ${CH}`} preserveAspectRatio="none" className="flex-1 h-full">
                {[70, 140, 210, 280].map(gy => <line key={gy} x1="0" y1={gy} x2={CW} y2={gy} stroke="#1A1A1A" strokeWidth="1" />)}
                {CANDLES.map((c, i) => {
                  const x = i * step + step / 2;
                  const up = c.c >= c.o;
                  const col = up ? '#08C465' : '#FE3A31';
                  return (
                    <g key={i}>
                      <line x1={x} y1={y(c.h)} x2={x} y2={y(c.l)} stroke={col} strokeWidth="1.5" />
                      <rect x={x - bw / 2} y={y(Math.max(c.o, c.c))} width={bw} height={Math.max(2, Math.abs(y(c.o) - y(c.c)))} fill={col} rx="1" />
                    </g>
                  );
                })}
                {/* Entry marker */}
                <g>
                  <line x1={step * 8.5} y1="0" x2={step * 8.5} y2={CH} stroke="#08C465" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                  <polygon points={`${step * 8.5 - 6},${y(84) + 14} ${step * 8.5 + 6},${y(84) + 14} ${step * 8.5},${y(84) + 4}`} fill="#08C465" />
                </g>
                {/* Exit marker */}
                <g>
                  <line x1={step * 19.5} y1="0" x2={step * 19.5} y2={CH} stroke="#FE3A31" strokeWidth="1" strokeDasharray="4 4" opacity="0.5" />
                  <polygon points={`${step * 19.5 - 6},${y(164) - 14} ${step * 19.5 + 6},${y(164) - 14} ${step * 19.5},${y(164) - 4}`} fill="#FE3A31" />
                </g>
              </svg>
              <div className="w-10 shrink-0 flex flex-col justify-between pl-2 text-[8.5px] text-fg-3 numeric">
                <span>4,180</span><span>4,120</span><span>4,060</span><span>4,000</span>
              </div>
            </div>
            {/* Playback bar */}
            <div className="mt-3 flex items-center gap-3">
              <span className="w-6 h-6 rounded-full bg-profit/15 text-profit flex items-center justify-center text-[10px]">▶</span>
              <div className="flex-1 h-1.5 rounded-full bg-surface-active overflow-hidden"><span className="block h-full bg-profit/70 rounded-full" style={{ width: '64%' }} /></div>
              <span className="text-[10px] text-fg-3 numeric">bar 14 / 22</span>
            </div>
          </div>
        </div>
      </div>
    </ScaledMock>
  );
}
