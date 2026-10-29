import { Chip, Sample, seeded } from '../ui';
import { Ic } from '../icons';

// Journal: a 3D glass replay slab (candles, entry/exit, TP/SL, scrubber) over a
// blurred notes card, on a perspective floor. Canvas 560×400.

function candles() {
  const rnd = seeded(7);
  const out: { x: number; o: number; c: number; hi: number; lo: number }[] = [];
  let pr = 150;
  for (let i = 0; i < 24; i++) {
    const o = pr;
    pr += (rnd() - 0.47) * 13;
    pr = Math.max(96, Math.min(186, pr));
    const c = i > 12 ? pr - (i - 12) * 2.2 : pr; // the trade works: price climbs after entry
    out.push({ x: 34 + i * 12.6, o, c, hi: Math.min(o, c) - rnd() * 8, lo: Math.max(o, c) + rnd() * 8 });
    pr = c;
  }
  return out;
}

const SLAB_SHADOW = [
  'inset 0 1px 0 rgba(255,255,255,.26)', 'inset 0 0 0 1px rgba(255,255,255,.08)',
  'inset -1px -1px 0 rgba(61,226,150,.35)', 'inset 0 -30px 50px -30px rgba(8,196,101,.25)',
  '0 2px 0 #0d3320', '0 4px 0 #0a2a1a', '0 6px 0 #082215', '0 8px 0 #071c11', '0 10px 0 #06170e', '0 12px 0 #05120b', '0 14px 0 #040e09',
  '0 60px 80px -10px rgba(0,0,0,.85)', '0 0 110px rgba(8,196,101,.3)',
].join(',');

export default function JournalArt() {
  const cs = candles();
  const entry = cs[12]!, exit = cs[21]!;
  return (
    <>
      <div className="art-floor" />
      <Sample style={{ right: 16, top: 16 }} />

      {/* soft contact shadow under the tilted slab */}
      <div style={{ position: 'absolute', left: 120, top: 268, width: 330, height: 70, borderRadius: '50%', background: 'rgba(0,0,0,.6)', filter: 'blur(24px)', transform: 'rotate(-14deg)' }} />

      {/* back card: notes, blurred for depth */}
      <div style={{ position: 'absolute', left: 40, top: 40, width: 300, height: 210, perspective: 1000, opacity: 0.55, filter: 'blur(1.2px)' }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 22, transform: 'rotateX(44deg) rotateZ(-28deg)',
          background: 'linear-gradient(150deg,#232327,#121214)', boxShadow: 'inset 0 1px 0 rgba(255,255,255,.18),0 2px 0 #0d0d0f,0 4px 0 #0b0b0c,0 6px 0 #09090a,0 30px 40px -10px rgba(0,0,0,.8)',
        }}>
          <svg viewBox="0 0 300 210" width="300" height="210" style={{ position: 'absolute', inset: 0 }} aria-hidden>
            <rect x="20" y="20" width="80" height="8" rx="4" fill="#fff" opacity=".25" />
            {[44, 60, 76, 92].map((y, i) => <rect key={y} x="20" y={y} width={[220, 180, 200, 120][i]} height="6" rx="3" fill="#fff" opacity=".09" />)}
            <rect x="20" y="118" width="58" height="20" rx="10" fill="#08C465" opacity=".22" />
            <rect x="84" y="118" width="74" height="20" rx="10" fill="#fff" opacity=".08" />
            <rect x="164" y="118" width="50" height="20" rx="10" fill="#fff" opacity=".08" />
          </svg>
        </div>
      </div>

      {/* main glass slab */}
      <div style={{ position: 'absolute', left: 92, top: 70, width: 390, height: 276, perspective: 1000 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: 26, transform: 'rotateX(44deg) rotateZ(-28deg)', transformStyle: 'preserve-3d',
          background: 'linear-gradient(150deg,#2A2A30 0%,#151518 42%,#0B0B0C 100%)', boxShadow: SLAB_SHADOW, overflow: 'hidden',
        }}>
          <svg viewBox="0 0 390 276" width="390" height="276" style={{ position: 'absolute', inset: 0 }} aria-hidden>
            <defs>
              <linearGradient id="j-sheen" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#fff" stopOpacity=".11" /><stop offset=".42" stopColor="#fff" stopOpacity="0" /></linearGradient>
              <linearGradient id="j-pos" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#08C465" stopOpacity=".26" /><stop offset="1" stopColor="#08C465" stopOpacity=".04" /></linearGradient>
            </defs>
            {/* header */}
            <rect x="22" y="18" width="108" height="24" rx="12" fill="#fff" opacity=".07" />
            <circle cx="36" cy="30" r="5" fill="#08C465" />
            <text x="47" y="34" style={{ fontFamily: 'var(--mono)' }} fontSize="10.5" fill="#fff" fillOpacity=".8">XAUUSD · 1h</text>
            <rect x="282" y="18" width="86" height="24" rx="12" fill="#08C465" opacity=".18" />
            <text x="325" y="34" textAnchor="middle" style={{ fontFamily: 'var(--mono)' }} fontSize="11" fill="#3DE296">+$612.40</text>
            {/* grid */}
            {[80, 120, 160, 200].map(y => <line key={y} x1="22" x2="368" y1={y} y2={y} stroke="#fff" strokeOpacity=".05" />)}
            {/* position box: entry → take profit */}
            <rect x={entry.x} y={84} width={exit.x - entry.x + 6} height={entry.c - 84} fill="url(#j-pos)" />
            <line x1="22" x2="368" y1="84" y2="84" stroke="#3DE296" strokeDasharray="4 5" strokeOpacity=".75" />
            <text x="364" y="79" textAnchor="end" style={{ fontFamily: 'var(--mono)' }} fontSize="9" fill="#3DE296" fillOpacity=".85">TP</text>
            <line x1="22" x2="368" y1={entry.c + 26} y2={entry.c + 26} stroke="#FE3A31" strokeDasharray="4 5" strokeOpacity=".6" />
            <text x="364" y={entry.c + 22} textAnchor="end" style={{ fontFamily: 'var(--mono)' }} fontSize="9" fill="#FF7A70" fillOpacity=".85">SL</text>
            {/* candles */}
            {cs.map((k, i) => {
              const up = k.c < k.o; const col = up ? '#08C465' : '#FE3A31';
              return (
                <g key={i} opacity={i > 21 ? 0.35 : 1}>
                  <line x1={k.x + 3} x2={k.x + 3} y1={k.hi} y2={k.lo} stroke={col} strokeWidth="1.2" />
                  <rect x={k.x} y={Math.min(k.o, k.c)} width="6.5" height={Math.max(2, Math.abs(k.c - k.o))} rx="1.2" fill={col} />
                </g>
              );
            })}
            {/* entry / exit markers */}
            <circle cx={entry.x + 3} cy={entry.c} r="9" fill="#08C465" opacity=".2" />
            <circle cx={entry.x + 3} cy={entry.c} r="4.5" fill="#08C465" stroke="#0B0B0C" strokeWidth="1.5" />
            <circle cx={exit.x + 3} cy={exit.c} r="4.5" fill="#EDEDEF" stroke="#0B0B0C" strokeWidth="1.5" />
            {/* replay scrubber */}
            <rect x="22" y="226" width="346" height="30" rx="11" fill="#fff" opacity=".05" />
            <circle cx="40" cy="241" r="8" fill="#fff" opacity=".12" />
            <path d="M37.5 236.5 v9 l7.5 -4.5z" fill="#fff" opacity=".8" />
            <rect x="56" y="239" width="296" height="4" rx="2" fill="#fff" opacity=".1" />
            <rect x="56" y="239" width="236" height="4" rx="2" fill="#08C465" />
            <circle cx="292" cy="241" r="6" fill="#EDEDEF" />
            <rect width="390" height="276" rx="26" fill="url(#j-sheen)" />
            <path d="M-20 300 L120 -20" stroke="#fff" strokeOpacity=".05" strokeWidth="40" />
          </svg>
        </div>
      </div>

      <Chip x={262} y={40} sym="XAU" title="XAUUSD · Long" sub="Closed 14:02 · held 2h 10m" value="+$612.40" valueTone="pos" />
      <Chip x={18} y={276} sym="EU" title="EURUSD · Short" sub="Stopped out · tagged “late entry”" value="−$118.20" valueTone="neg" />
      <Chip x={306} y={332} icon="tag" title="Note added" sub="“Waited for the retest”" extra={<span className="it xs" style={{ marginLeft: 8 }}><Ic name="check" /></span>} />
    </>
  );
}
