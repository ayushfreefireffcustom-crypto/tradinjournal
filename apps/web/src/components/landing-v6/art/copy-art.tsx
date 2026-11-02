import { Chip, Sample, seeded } from '../ui';
import { Ic } from '../icons';

// Copy trading (A5.3b): a leader's glass card hands a fill down a dashed path to
// your card, sized to your account, with the "Copied" toast on arrival. Every
// number is a labelled sample. Canvas 560×400.

function curve(n: number, seed: number, rise: number) {
  const rnd = seeded(seed);
  let v = 0;
  return Array.from({ length: n }, (_, i) => (v += (rnd() - 0.42) * 6 + rise / n, i === 0 ? 0 : v));
}
function spark(pts: number[], w: number, h: number) {
  const lo = Math.min(...pts), hi = Math.max(...pts);
  return pts.map((p, i) => `${i ? 'L' : 'M'}${((i / (pts.length - 1)) * w).toFixed(1)} ${(h - ((p - lo) / (hi - lo || 1)) * h).toFixed(1)}`).join(' ');
}

const CARD_SHADOW = [
  'inset 0 1px 0 rgba(255,255,255,.22)', 'inset 0 0 0 1px rgba(255,255,255,.07)',
  '0 2px 0 #19191c', '0 4px 0 #141417', '0 6px 0 #111113', '0 8px 0 #0e0e10',
  '0 40px 60px -16px rgba(0,0,0,.85)',
].join(',');
const GREEN_SHADOW = [
  'inset 0 1px 0 rgba(255,255,255,.24)', 'inset 0 0 0 1px rgba(61,226,150,.28)', 'inset 0 -24px 40px -24px rgba(8,196,101,.3)',
  '0 2px 0 #0d3320', '0 4px 0 #0a2a1a', '0 6px 0 #082215', '0 8px 0 #071c11',
  '0 40px 60px -16px rgba(0,0,0,.85)', '0 0 90px rgba(8,196,101,.28)',
].join(',');

function Card({ x, y, w, h, green, children }: { x: number; y: number; w: number; h: number; green?: boolean; children: React.ReactNode }) {
  return (
    <div style={{ position: 'absolute', left: x, top: y, width: w, height: h, borderRadius: 22, overflow: 'hidden', boxShadow: green ? GREEN_SHADOW : CARD_SHADOW,
      background: green ? 'linear-gradient(150deg,#1F3A2C 0%,#12201A 45%,#0B110E 100%)' : 'linear-gradient(150deg,#2A2A30 0%,#161619 45%,#0D0D0F 100%)' }}>
      {children}
    </div>
  );
}

export default function CopyArt() {
  const lead = spark(curve(28, 11, 60), 196, 46);
  const mine = spark(curve(28, 11, 60), 172, 36);
  return (
    <>
      <div className="art-dots" />
      <Sample style={{ left: 16, top: 16 }} />

      {/* the path the fill travels */}
      <svg width="560" height="400" viewBox="0 0 560 400" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <linearGradient id="cp-path" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".25" /><stop offset="1" stopColor="#3DE296" /></linearGradient>
          <radialGradient id="cp-glow" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#08C465" stopOpacity=".5" /><stop offset="1" stopColor="#08C465" stopOpacity="0" /></radialGradient>
        </defs>
        <ellipse cx="360" cy="352" rx="190" ry="34" fill="url(#cp-glow)" />
        <path d="M196 226 C 196 286, 268 250, 300 252" fill="none" stroke="url(#cp-path)" strokeWidth="2" strokeDasharray="5 6" />
        <circle cx="252" cy="257" r="9" fill="#08C465" opacity=".2" />
        <circle cx="252" cy="257" r="4.5" fill="#3DE296" />
      </svg>

      {/* leader */}
      <Card x={42} y={66} w={240} h={158}>
        <svg viewBox="0 0 240 158" width="240" height="158" style={{ position: 'absolute', inset: 0 }} aria-hidden>
          <circle cx="36" cy="34" r="15" fill="#fff" fillOpacity=".1" />
          <text x="36" y="38" textAnchor="middle" style={{ fontFamily: 'var(--mono)' }} fontSize="10.5" fill="#EDEDEF">MK</text>
          <text x="60" y="31" fontSize="12.5" fill="#EDEDEF">Leader · verified</text>
          <text x="60" y="46" fontSize="10.5" fill="#8A8A93">Synced from the exchange</text>
          <text x="22" y="76" style={{ fontFamily: 'var(--mono)' }} fontSize="17" fill="#3DE296">+18.4%</text>
          <text x="96" y="76" fontSize="10.5" fill="#8A8A93">90 days</text>
          <g transform="translate(22 88)"><path d={lead} fill="none" stroke="#3DE296" strokeWidth="1.8" strokeLinejoin="round" /></g>
        </svg>
      </Card>
      <Chip x={150} y={202} sym="BTC" title="BTCUSD · Long 0.50" sub="Leader filled 14:02:07" style={{ zIndex: 5 }} />

      {/* you */}
      <Card x={300} y={196} w={216} h={140} green>
        <svg viewBox="0 0 216 140" width="216" height="140" style={{ position: 'absolute', inset: 0 }} aria-hidden>
          <rect x="18" y="18" width="62" height="22" rx="11" fill="#08C465" opacity=".22" />
          <text x="49" y="33" textAnchor="middle" fontSize="11" fill="#3DE296">You</text>
          <text x="198" y="33" textAnchor="end" style={{ fontFamily: 'var(--mono)' }} fontSize="10.5" fill="#CFEFDD">BTCUSD · 0.05</text>
          <text x="18" y="62" fontSize="10.5" fill="#9BC4AE">Sized at 10% of the leader</text>
          <g transform="translate(18 76)"><path d={mine} fill="none" stroke="#3DE296" strokeOpacity=".75" strokeWidth="1.6" strokeLinejoin="round" /></g>
          <rect x="18" y="118" width="180" height="4" rx="2" fill="#fff" opacity=".08" />
          <rect x="18" y="118" width="54" height="4" rx="2" fill="#3DE296" opacity=".7" />
        </svg>
      </Card>
      <div className="chip" style={{ left: 330, top: 344, zIndex: 5 }}>
        <span className="sym" style={{ color: '#3DE296' }}><Ic name="shield" size={15} /></span>
        <div>Your daily loss limit<small>$50 · 30% used today</small></div>
      </div>

      {/* arrival toast */}
      <div className="chip" style={{ left: 300, top: 120, zIndex: 6, boxShadow: 'inset 0 1px 0 rgba(255,255,255,.16),0 0 0 1px rgba(61,226,150,.35),0 18px 40px -12px rgba(8,196,101,.45)' }}>
        <span className="it xs"><Ic name="check" /></span>
        <div>Copied <span className="num">· 1.4 s</span><small>Slippage <span className="num">0.02%</span> · within your limit</small></div>
        <span className="dot" />
      </div>
    </>
  );
}
