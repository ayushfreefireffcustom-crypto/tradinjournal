import { Chip, Sample } from '../ui';

// Analytics: isometric glass bars on an engraved plate, a floating equity
// ribbon, one red "leak" bar. Canvas 560×400.

type Pal = 'g' | 'r' | 'k';
type P = [number, number];
const pt = (p: P) => `${p[0]} ${p[1]}`;

function Box({ x, y, a, h, pal, label }: { x: number; y: number; a: number; h: number; pal: Pal; label?: { text: string; tone: 'pos' | 'neg' } }) {
  const b = a * 0.5;
  const T: P = [x, y - h - b], R: P = [x + a, y - h], B: P = [x, y - h + b], L: P = [x - a, y - h];
  const Bb: P = [B[0], B[1] + h], Lb: P = [L[0], L[1] + h], Rb: P = [R[0], R[1] + h];
  return (
    <g>
      {/* contact shadow on the plate */}
      {pal !== 'k' && <path d={`M${pt(Lb)} L${pt(Bb)} L${Rb[0] + 10} ${Rb[1] + 5} L${Lb[0] + 10} ${Lb[1] + 5} Z`} fill="#000" opacity=".35" filter="url(#a-sh)" />}
      <path d={`M${pt(L)} L${pt(B)} L${pt(Bb)} L${pt(Lb)} Z`} fill={`url(#a-${pal}l)`} />
      <path d={`M${pt(B)} L${pt(R)} L${pt(Rb)} L${pt(Bb)} Z`} fill={`url(#a-${pal}r)`} />
      <path d={`M${pt(T)} L${pt(R)} L${pt(B)} L${pt(L)} Z`} fill={`url(#a-${pal}t)`} />
      {/* top bevel + edge light + inner glass streak on the left face */}
      <path d={`M${pt(L)} L${pt(T)} L${pt(R)}`} fill="none" stroke="#fff" strokeOpacity=".6" strokeWidth="1" />
      <path d={`M${pt(L)} L${pt(B)} L${pt(R)}`} fill="none" stroke="#fff" strokeOpacity=".22" strokeWidth=".8" />
      <path d={`M${pt(B)} L${pt(Bb)}`} stroke="#fff" strokeOpacity=".28" strokeWidth="1" />
      {pal !== 'k' && h > 30 && <path d={`M${L[0] + 6} ${L[1] + 7} L${L[0] + 6} ${L[1] + h - 4}`} stroke="#fff" strokeOpacity=".22" strokeWidth="1.6" strokeLinecap="round" />}
      {label && (
        <g transform={`translate(${T[0]} ${T[1] - 18})`}>
          <rect x="-30" y="-12" width="60" height="22" rx="8" fill="rgba(20,20,23,.85)" stroke={label.tone === 'pos' ? 'rgba(8,196,101,.45)' : 'rgba(254,58,49,.5)'} />
          <text x="0" y="3.5" textAnchor="middle" style={{ fontFamily: 'var(--mono)' }} fontSize="10.5" fill={label.tone === 'pos' ? '#3DE296' : '#FF8A82'}>{label.text}</text>
          <path d="M0 10 V18" stroke="#fff" strokeOpacity=".2" />
        </g>
      )}
    </g>
  );
}

const STOPS: Record<string, [number, string, number][]> = {
  gt: [[0, '#8DF5C3', 1], [1, '#16D178', 1]], gl: [[0, '#10BA63', .95], [1, '#04502A', .9]], gr: [[0, '#0A8E4B', .95], [1, '#02301A', .9]],
  rt: [[0, '#FFB0AA', 1], [1, '#FE3A31', 1]], rl: [[0, '#E52A21', .95], [1, '#6A0D09', .9]], rr: [[0, '#B81C15', .95], [1, '#3E0805', .9]],
  kt: [[0, '#3E3E45', 1], [1, '#28282D', 1]], kl: [[0, '#202024', 1], [1, '#131315', 1]], kr: [[0, '#18181B', 1], [1, '#0D0D0F', 1]],
};

export default function AnalyticsArt() {
  // [x, y, half-width, height, palette, label]
  const bars: [number, number, number, number, Pal, { text: string; tone: 'pos' | 'neg' }?][] = [
    [170, 262, 32, 80, 'g'], [234, 294, 32, 140, 'g'], [298, 326, 32, 58, 'r', { text: '−$840', tone: 'neg' }],
    [226, 230, 32, 104, 'g'], [290, 262, 32, 196, 'g', { text: '+$2.1k', tone: 'pos' }], [354, 294, 32, 120, 'g'],
    [282, 198, 32, 128, 'g'], [346, 230, 32, 162, 'g'], [410, 262, 32, 96, 'g'],
  ];
  bars.sort((p, q) => p[1] - q[1] || p[0] - q[0]);
  return (
    <>
      <Sample style={{ left: 16, top: 16 }} />
      <svg width="560" height="400" viewBox="0 0 560 400" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          {Object.entries(STOPS).map(([id, stops]) => (
            <linearGradient key={id} id={`a-${id}`} x1="0" y1="0" x2={id.endsWith('t') ? '1' : '0'} y2="1">
              {stops.map(([o, c, op]) => <stop key={o} offset={o} stopColor={c} stopOpacity={op} />)}
            </linearGradient>
          ))}
          <radialGradient id="a-bloom" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#08C465" stopOpacity=".5" /><stop offset="1" stopColor="#08C465" stopOpacity="0" /></radialGradient>
          <radialGradient id="a-rbloom" cx="50%" cy="50%" r="50%"><stop offset="0" stopColor="#FE3A31" stopOpacity=".55" /><stop offset="1" stopColor="#FE3A31" stopOpacity="0" /></radialGradient>
          <linearGradient id="a-rib" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3DE296" stopOpacity="0" /><stop offset=".25" stopColor="#3DE296" /><stop offset="1" stopColor="#C8FFE2" /></linearGradient>
          <filter id="a-sh" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="4" /></filter>
          <filter id="a-glow" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="5" /></filter>
        </defs>
        <ellipse cx="290" cy="352" rx="250" ry="56" fill="url(#a-bloom)" />
        {/* plate */}
        <Box x={290} y={330} a={214} h={14} pal="k" />
        <g opacity=".5">
          {[0.25, 0.5, 0.75].map(t => (
            <g key={t} stroke="#fff" strokeOpacity=".09">
              <line x1={290 - 214 + 214 * t} y1={316 - 107 * t} x2={290 + 214 * t} y2={316 + 107 - 107 * t} />
              <line x1={290 - 214 + 214 * t} y1={316 + 107 * t} x2={290 + 214 * t} y2={316 - 107 + 107 * t} />
            </g>
          ))}
        </g>
        <ellipse cx="298" cy="300" rx="70" ry="30" fill="url(#a-rbloom)" />
        {bars.map(([x, y, a, h, pal, label]) => <Box key={`${x}-${y}`} x={x} y={y} a={a} h={h} pal={pal} label={label} />)}
        {/* floating equity ribbon */}
        <path d="M70 196 C130 186 150 150 200 140 S270 112 300 96 S380 70 470 52" fill="none" stroke="#08C465" strokeOpacity=".5" strokeWidth="8" filter="url(#a-glow)" />
        <path d="M70 196 C130 186 150 150 200 140 S270 112 300 96 S380 70 470 52" fill="none" stroke="url(#a-rib)" strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="470" cy="52" r="5" fill="#C8FFE2" /><circle cx="470" cy="52" r="12" fill="#3DE296" opacity=".2" />
      </svg>
      <Chip x={330} y={92} icon="clock" title="Best window" sub="London open, 07:00–10:00" />
      <Chip x={22} y={322} red icon="pulse" symStyle={{ background: 'rgba(254,58,49,.18)', color: '#FF8A82' }} title="Leak found" sub="Friday entries after 15:00" />
    </>
  );
}
