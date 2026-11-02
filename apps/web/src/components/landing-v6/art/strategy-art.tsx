import { Sample, seeded } from '../ui';
import { Ic } from '../icons';

// Strategies (A5.3c): rule blocks stacked like extruded glass bricks
// ("RSI < 30", "EMA 50 > EMA 200", the order and the stop), a backtest curve
// card behind them and a green Deploy chip. A labelled sample. Canvas 560×400.

type Block = { x: number; y: number; w: number; kind: 'when' | 'and' | 'then'; text: string; accent?: boolean };
const BLOCKS: Block[] = [
  { x: 70, y: 92, w: 236, kind: 'when', text: 'RSI(14) < 30' },
  { x: 92, y: 150, w: 264, kind: 'and', text: 'EMA 50 > EMA 200' },
  { x: 114, y: 208, w: 250, kind: 'then', text: 'Buy · risk 1%', accent: true },
  { x: 136, y: 266, w: 232, kind: 'and', text: 'Stop 1.5 × ATR' },
];
const H = 44;

function Brick({ b }: { b: Block }) {
  const top = b.accent ? 'url(#st-top-g)' : 'url(#st-top)';
  const side = b.accent ? '#0A2A1A' : '#111114';
  const tag = b.kind === 'when' ? 'WHEN' : b.kind === 'then' ? 'THEN' : 'AND';
  return (
    <g>
      <rect x={b.x + 6} y={b.y + 14} width={b.w} height={H} rx="14" fill="#000" opacity=".5" filter="url(#st-b8)" />
      <rect x={b.x} y={b.y + 8} width={b.w} height={H} rx="14" fill={side} />
      <rect x={b.x} y={b.y} width={b.w} height={H} rx="14" fill={top} stroke={b.accent ? 'rgba(61,226,150,.5)' : 'rgba(255,255,255,.1)'} />
      <path d={`M${b.x + 14} ${b.y + 1} H${b.x + b.w - 14}`} stroke="#fff" strokeOpacity={b.accent ? 0.45 : 0.22} />
      {/* the notch that locks it to the brick below */}
      <rect x={b.x + 22} y={b.y + H - 2} width="26" height="8" rx="3" fill={top} />
      <rect x={b.x + 12} y={b.y + 12} width={b.kind === 'then' ? 44 : b.kind === 'when' ? 48 : 36} height="20" rx="10" fill={b.accent ? '#08C465' : '#fff'} opacity={b.accent ? 0.24 : 0.08} />
      <text x={b.x + 12 + (b.kind === 'then' ? 22 : b.kind === 'when' ? 24 : 18)} y={b.y + 26} textAnchor="middle" style={{ fontFamily: 'var(--mono)' }} fontSize="9.5" letterSpacing=".06em" fill={b.accent ? '#3DE296' : '#8A8A93'}>{tag}</text>
      <text x={b.x + (b.kind === 'then' ? 66 : b.kind === 'when' ? 70 : 58)} y={b.y + 27} style={{ fontFamily: 'var(--mono)' }} fontSize="13" fill="#EDEDEF">{b.text}</text>
    </g>
  );
}

export default function StrategyArt({ live = false }: { live?: boolean }) {
  const rnd = seeded(23);
  let v = 0;
  const pts = Array.from({ length: 36 }, (_, i) => (i === 0 ? 0 : (v += (rnd() - 0.4) * 5)));
  const lo = Math.min(...pts), hi = Math.max(...pts);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${(i * 5.4).toFixed(1)} ${(52 - ((p - lo) / (hi - lo || 1)) * 52).toFixed(1)}`).join(' ');
  return (
    <>
      <div className="art-floor" />
      <Sample style={{ right: 16, top: 16 }} />
      <svg width="560" height="400" viewBox="0 0 560 400" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <linearGradient id="st-top" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2C2C32" /><stop offset="1" stopColor="#18181B" /></linearGradient>
          <linearGradient id="st-top-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1E4A33" /><stop offset="1" stopColor="#0F2419" /></linearGradient>
          <linearGradient id="st-area" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#08C465" stopOpacity=".3" /><stop offset="1" stopColor="#08C465" stopOpacity="0" /></linearGradient>
          <radialGradient id="st-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#08C465" stopOpacity=".45" /><stop offset="1" stopColor="#08C465" stopOpacity="0" /></radialGradient>
          <filter id="st-b8" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="8" /></filter>
          <filter id="st-soft" x="-10%" y="-10%" width="120%" height="120%"><feGaussianBlur stdDeviation="1.1" /></filter>
        </defs>

        <ellipse cx="270" cy="350" rx="220" ry="36" fill="url(#st-glow)" />

        {/* backtest card behind the stack */}
        <g transform="translate(316 40)" opacity=".75" filter="url(#st-soft)">
          <rect width="214" height="128" rx="18" fill="#17171A" stroke="rgba(255,255,255,.08)" />
          <text x="16" y="26" fontSize="11" fill="#8A8A93">Backtest · 2 years</text>
          <text x="198" y="26" textAnchor="end" style={{ fontFamily: 'var(--mono)' }} fontSize="11" fill="#3DE296">142 trades</text>
          <g transform="translate(16 50)">
            <path d={`${line} L${35 * 5.4} 60 L0 60 Z`} fill="url(#st-area)" />
            <path d={line} fill="none" stroke="#3DE296" strokeWidth="1.7" strokeLinejoin="round" />
          </g>
        </g>

        {BLOCKS.map((b) => <Brick key={b.text} b={b} />)}
      </svg>

      <div className="chip" style={{ left: 330, top: 324, zIndex: 5, gap: 8, padding: '8px 14px 8px 8px', background: 'linear-gradient(180deg,rgba(14,70,42,.85),rgba(8,44,26,.8))', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.22),0 0 0 1px rgba(61,226,150,.5),0 18px 40px -10px rgba(8,196,101,.55)' }}>
        <span className="it xs"><Ic name="play" /></span>
        <div style={{ color: '#E8FFF2' }}>Deploy<small style={{ color: '#9BD6B5' }}>{live ? 'Paper first, then live' : 'On paper, simulated fills'}</small></div>
      </div>
      <div className="chip" style={{ left: 24, top: 330, zIndex: 5 }}>
        <span className="sym"><Ic name="blocks" size={15} /></span>
        <div>Built from a sentence<small>“Buy oversold dips in an uptrend”</small></div>
      </div>
    </>
  );
}
