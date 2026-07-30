'use client';

// Rich empty state for Chart Replay. Rather than three lonely blank columns,
// it explains what the tool does — replay each position as a chart, tag the
// emotion behind it, audit the process — with a live decorative replay mock and
// a clear next step. Two variants: no broker connected (Connect CTA) and a
// broker with no closed trades yet. Inspired by Notion / Linear / Arc empty
// states and the trade-replay reviews in TradeZella & Tradervue.
import { FilmSlate, ChartLineUp, Brain, MagnifyingGlass, PlugsConnected, ArrowRight } from '@phosphor-icons/react';

const FEATURES: { icon: typeof ChartLineUp; title: string; body: string }[] = [
  { icon: ChartLineUp, title: 'Replay the path', body: 'Every closed position redrawn as a chart with your entry and exit marked — see exactly where you got in and out.' },
  { icon: Brain, title: 'Tag the emotion', body: 'Was it discipline or FOMO? Label the mindset behind each trade so patterns in your behaviour surface over time.' },
  { icon: MagnifyingGlass, title: 'Audit the process', body: 'Add setup tags and post-trade notes. Turn a list of P&L into a searchable record of how you actually traded.' },
];

/** A small decorative candlestick + entry/exit mock — echoes the real replay. */
function ReplayMock() {
  const bars = [
    { x: 6, o: 46, c: 34, up: true }, { x: 18, o: 34, c: 40, up: false }, { x: 30, o: 40, c: 24, up: true },
    { x: 42, o: 24, c: 30, up: false }, { x: 54, o: 30, c: 18, up: true }, { x: 66, o: 18, c: 26, up: false },
    { x: 78, o: 26, c: 14, up: true }, { x: 90, o: 14, c: 22, up: false }, { x: 102, o: 22, c: 32, up: false },
    { x: 114, o: 32, c: 44, up: false }, { x: 126, o: 44, c: 38, up: true }, { x: 138, o: 38, c: 50, up: false },
  ];
  return (
    <svg viewBox="0 0 160 80" className="w-full h-full" aria-hidden>
      {/* entry / exit guide lines */}
      <line x1="0" x2="160" y1="30" y2="30" stroke="#FFFFFF" strokeOpacity="0.35" strokeDasharray="3 3" strokeWidth="0.7" />
      <line x1="0" x2="160" y1="52" y2="52" stroke="#08C465" strokeOpacity="0.5" strokeDasharray="3 3" strokeWidth="0.7" />
      {/* shaded result zone */}
      <rect x="30" y="30" width="72" height="22" fill="#08C465" fillOpacity="0.07" />
      {bars.map((b, i) => {
        const top = Math.min(b.o, b.c), h = Math.max(1.5, Math.abs(b.o - b.c));
        const col = b.up ? '#08C465' : '#FE3A31';
        return (
          <g key={i}>
            <line x1={b.x} x2={b.x} y1={top - 5} y2={top + h + 5} stroke={col} strokeWidth="0.8" strokeOpacity="0.9" />
            <rect x={b.x - 3} y={top} width="6" height={h} fill={col} rx="0.5" />
          </g>
        );
      })}
      {/* markers */}
      <polygon points="27,30 33,30 30,35" fill="#08C465" />
      <polygon points="99,52 105,52 102,47" fill="#08C465" />
    </svg>
  );
}

export default function ReplayEmpty({ hasBroker, onConnect }: { hasBroker: boolean; onConnect?: () => void }) {
  return (
    <div className="tcard px-5 sm:px-10 py-10 sm:py-14 fade-up" data-testid="replay-empty">
      <div className="max-w-4xl mx-auto">
        <div className="grid lg:grid-cols-[1.1fr_1fr] gap-8 lg:gap-12 items-center">
          {/* Pitch */}
          <div className="text-center lg:text-left">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-profit/12 ring-1 ring-profit/25 mb-5">
              <FilmSlate size={24} weight="fill" className="text-profit" />
            </span>
            <h2 className="font-display font-black text-[22px] sm:text-[26px] tracking-tight leading-tight">
              {hasBroker ? 'No closed trades to replay yet' : 'Replay every trade like game tape'}
            </h2>
            <p className="text-fg-2 text-[13.5px] leading-relaxed mt-3 max-w-md mx-auto lg:mx-0">
              {hasBroker
                ? 'Once your connected account logs a closed position, it lands here — redrawn as a chart so you can review the entry, the exit, and what you were thinking.'
                : 'Chart Replay turns your MT5 history into a forensic review room. Step through each position on a chart, mark the emotion behind it, and build a record of your process — not just your P&L.'}
            </p>
            {!hasBroker && onConnect && (
              <button onClick={onConnect} data-testid="replay-connect" className="btn btn-primary mt-6 py-2.5 px-5 text-[11px] tracking-[0.18em] inline-flex items-center gap-2">
                <PlugsConnected size={15} weight="bold" /> CONNECT A BROKER
              </button>
            )}
          </div>

          {/* Decorative replay mock */}
          <div className="rounded-[var(--radius-card)] border border-border-soft bg-surface/40 p-4 sm:p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="font-display font-bold text-[13px] tracking-tight">EURUSD</span>
              <span className="text-[9px] tracking-[0.2em] text-fg-3 border border-border-soft px-2 py-0.5 rounded">SCHEMATIC</span>
            </div>
            <div className="h-28 sm:h-32"><ReplayMock /></div>
            <div className="grid grid-cols-3 gap-2 mt-3 pt-3 border-t border-border-soft text-center">
              {[['ENTRY', '1.0824'], ['EXIT', '1.0871'], ['RESULT', '+47 pips']].map(([k, v], i) => (
                <div key={k}>
                  <div className="text-[8px] tracking-[0.18em] text-fg-3">{k}</div>
                  <div className={`numeric text-[12px] mt-0.5 ${i === 2 ? 'text-profit' : 'text-fg'}`}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Feature row */}
        <div className="grid sm:grid-cols-3 gap-3 mt-9">
          {FEATURES.map(f => {
            const I = f.icon;
            return (
              <div key={f.title} className="rounded-[var(--radius-card)] border border-border-soft bg-surface/30 p-4">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-profit/10 mb-2.5">
                  <I size={15} weight="bold" className="text-profit" />
                </span>
                <div className="font-display font-semibold text-[13px] tracking-tight">{f.title}</div>
                <p className="text-[11.5px] text-fg-3 leading-relaxed mt-1">{f.body}</p>
              </div>
            );
          })}
        </div>

        {hasBroker && (
          <div className="flex items-center justify-center gap-1.5 text-[11px] text-fg-3 mt-8">
            <span>Your trades sync automatically</span>
            <ArrowRight size={12} weight="bold" className="text-profit" />
            <span className="text-fg-2">check back after your next close</span>
          </div>
        )}
      </div>
    </div>
  );
}
