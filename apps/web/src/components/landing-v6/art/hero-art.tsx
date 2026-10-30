import { Chip } from '../ui';

// Hero: the TRADElogs glass block on a perspective floor, ghost slabs around it,
// an orbit ring with frosted chips. Drawn on a 1200×470 canvas (see <Stage>).

const VX = 600;
const BASE = 470;

function floorLines() {
  const lines: [number, number, number, number][] = [];
  for (let x = -900; x <= 2100; x += 75) lines.push([VX + (x - VX) * 0.18, 150, x, BASE]);
  let y = 150, step = 10;
  while (y < BASE) { lines.push([0, y, 1200, y]); y += step; step *= 1.32; }
  return lines;
}

/** Ghost slab: a thin 3D card lying on the floor, with faint UI on its top face. */
function Slab({ cx, cy, w, d, skew, op, blur }: { cx: number; cy: number; w: number; d: number; skew: number; op: number; blur?: boolean }) {
  type P = [number, number];
  const tl: P = [cx - w / 2 + skew, cy - d / 2], tr: P = [cx + w / 2 + skew, cy - d / 2], br: P = [cx + w / 2, cy + d / 2], bl: P = [cx - w / 2, cy + d / 2];
  const p = (a: P) => `${a[0]} ${a[1]}`;
  const lerp = (a: P, b: P, t: number): P => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  // UI rows on the top face, laid along the plane
  const row = (t: number, len: number, o: number) => {
    const a = lerp(lerp(tl, bl, t), lerp(tr, br, t), 0.1), b = lerp(lerp(tl, bl, t), lerp(tr, br, t), 0.1 + len);
    return <path d={`M${p(a)} L${p(b)}`} stroke="#fff" strokeOpacity={o} strokeWidth={3} strokeLinecap="round" />;
  };
  return (
    <g opacity={op} filter={blur ? 'url(#h-soft)' : undefined}>
      <path d={`M${p(bl)} L${p(br)} L${br[0]} ${br[1] + 11} L${bl[0]} ${bl[1] + 11} Z`} fill="url(#h-slabside)" />
      <path d={`M${p(tl)} L${p(tr)} L${p(br)} L${p(bl)} Z`} fill="url(#h-ghost)" stroke="rgba(255,255,255,.13)" strokeWidth={1} strokeLinejoin="round" />
      <path d={`M${p(tl)} L${p(tr)}`} stroke="rgba(255,255,255,.28)" strokeWidth={1} />
      {row(0.3, 0.35, 0.22)}
      {row(0.55, 0.6, 0.09)}
      {row(0.75, 0.45, 0.09)}
      <circle cx={lerp(lerp(tl, bl, 0.3), lerp(tr, br, 0.3), 0.86)[0]} cy={lerp(lerp(tl, bl, 0.3), lerp(tr, br, 0.3), 0.86)[1]} r={2.6} fill="#3DE296" opacity={0.8} />
    </g>
  );
}

/** A candle standing on the block's top face: front face, side face, cap and wicks. */
function Candle({ x, base, h, up }: { x: number; base: number; h: number; up: boolean }) {
  const w = 22, side = 8, lift = 5;
  const top = base - h;
  const c = up ? { front: 'url(#h-cg)', side: '#05753B', cap: '#9CF5C8', wick: '#3DE296', glow: '#08C465' }
    : { front: 'url(#h-cr)', side: '#8E150F', cap: '#FFB3AD', wick: '#FF7A70', glow: '#FE3A31' };
  return (
    <g>
      <ellipse cx={x + 4} cy={base + 2} rx={26} ry={7} fill={c.glow} opacity={0.55} filter="url(#h-blur8)" />
      <rect x={x - 16} y={top - 10} width={w + 32} height={h + 20} rx={14} fill={c.glow} opacity={0.22} filter="url(#h-blur14)" />
      <line x1={x + w / 2} x2={x + w / 2} y1={top - 18} y2={top} stroke={c.wick} strokeWidth={2.4} strokeLinecap="round" />
      <path d={`M${x + w} ${top} l${side} ${-lift} v${h} l${-side} ${lift} Z`} fill={c.side} />
      <rect x={x} y={top} width={w} height={h} rx={3} fill={c.front} />
      <rect x={x + 3} y={top + 4} width={3} height={h - 10} rx={1.5} fill="#fff" opacity={0.35} />
      <path d={`M${x} ${top} l${side} ${-lift} h${w} l${-side} ${lift} Z`} fill={c.cap} opacity={0.95} />
    </g>
  );
}

export default function HeroArt() {
  const lines = floorLines();
  const topFace = 'M512 160 H688 Q708 160 716 179 L738 236 Q744 254 722 254 H478 Q456 254 462 236 L484 179 Q492 160 512 160 Z';
  const frontFace = 'M462 254 H738 V318 Q738 350 706 350 H494 Q462 350 462 318 Z';
  return (
    <>
      <svg width="1200" height="470" viewBox="0 0 1200 470" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <defs>
          <radialGradient id="h-floorfade" cx="50%" cy="40%" r="62%">
            <stop offset="0" stopColor="#fff" /><stop offset=".75" stopColor="#fff" stopOpacity=".25" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <mask id="h-floormask"><rect width="1200" height="470" fill="url(#h-floorfade)" /></mask>
          <linearGradient id="h-top" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#34343A" /><stop offset=".5" stopColor="#1A1A1E" /><stop offset="1" stopColor="#0E0E10" />
          </linearGradient>
          <radialGradient id="h-topglow" cx="50%" cy="62%" r="62%">
            <stop offset="0" stopColor="#08C465" stopOpacity=".42" /><stop offset=".55" stopColor="#08C465" stopOpacity=".07" /><stop offset="1" stopColor="#08C465" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="h-front" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#0B2A19" /><stop offset=".08" stopColor="#0C0D0E" /><stop offset=".5" stopColor="#141417" /><stop offset=".92" stopColor="#0C0D0E" /><stop offset="1" stopColor="#0B2A19" />
          </linearGradient>
          <linearGradient id="h-frontv" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".12" /><stop offset=".18" stopColor="#fff" stopOpacity="0" /><stop offset=".7" stopColor="#08C465" stopOpacity=".05" /><stop offset="1" stopColor="#08C465" stopOpacity=".28" />
          </linearGradient>
          <linearGradient id="h-rim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#08C465" stopOpacity="0" /><stop offset=".18" stopColor="#3DE296" stopOpacity=".9" /><stop offset=".5" stopColor="#D8FFEA" /><stop offset=".82" stopColor="#3DE296" stopOpacity=".9" /><stop offset="1" stopColor="#08C465" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="h-backrim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <radialGradient id="h-glow" cx="50%" cy="50%" r="50%">
            <stop offset="0" stopColor="#08C465" stopOpacity=".6" /><stop offset=".5" stopColor="#08C465" stopOpacity=".16" /><stop offset="1" stopColor="#08C465" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="h-ghost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".08" /><stop offset="1" stopColor="#fff" stopOpacity=".02" />
          </linearGradient>
          <linearGradient id="h-slabside" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity=".06" /><stop offset="1" stopColor="#fff" stopOpacity=".01" />
          </linearGradient>
          <linearGradient id="h-refl" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#08C465" stopOpacity=".14" /><stop offset=".35" stopColor="#08C465" stopOpacity=".04" /><stop offset="1" stopColor="#08C465" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="h-streak" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".14" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <linearGradient id="h-cg" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#5BEDA8" /><stop offset=".5" stopColor="#0FCB6E" /><stop offset="1" stopColor="#07A353" />
          </linearGradient>
          <linearGradient id="h-cr" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#FF8C84" /><stop offset=".5" stopColor="#FE3A31" /><stop offset="1" stopColor="#D2231B" />
          </linearGradient>
          <linearGradient id="h-orbit" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".3" stopColor="#3DE296" stopOpacity=".55" /><stop offset=".7" stopColor="#3DE296" stopOpacity=".55" /><stop offset="1" stopColor="#fff" stopOpacity="0" />
          </linearGradient>
          <clipPath id="h-topclip"><path d={topFace} /></clipPath>
          <clipPath id="h-frontclip"><path d={frontFace} /></clipPath>
          <filter id="h-blur22" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="22" /></filter>
          <filter id="h-blur14" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="14" /></filter>
          <filter id="h-blur8" x="-80%" y="-80%" width="260%" height="260%"><feGaussianBlur stdDeviation="8" /></filter>
          <filter id="h-blur4" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4" /></filter>
          <filter id="h-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="1.2" /></filter>
        </defs>

        {/* floor + horizon */}
        <g mask="url(#h-floormask)" stroke="#fff" strokeOpacity=".075" strokeWidth="1">
          {lines.map(([x1, y1, x2, y2], i) => <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />)}
        </g>
        <path d="M250 150 H950" stroke="url(#h-streak)" strokeWidth="1" />

        {/* orbit ring, back half (behind the block) */}
        <ellipse cx="600" cy="300" rx="380" ry="74" fill="none" stroke="#fff" strokeOpacity=".07" strokeDasharray="2 6" />

        {/* ghost slabs: far ones softer */}
        <Slab cx={300} cy={194} w={150} d={50} skew={26} op={0.75} blur />
        <Slab cx={900} cy={194} w={150} d={50} skew={-26} op={0.75} blur />
        <Slab cx={240} cy={372} w={176} d={58} skew={30} op={0.95} />
        <Slab cx={960} cy={372} w={176} d={58} skew={-30} op={0.95} />

        {/* connector traces with nodes */}
        <g fill="none" stroke="rgba(255,255,255,.11)" strokeWidth="1.2">
          <path d="M462 280 H372 q-14 0 -14 -14 V206 q0 -12 -12 -12 H330" />
          <path d="M462 320 H352 q-14 0 -14 14 V352 q0 12 -12 12 H300" />
          <path d="M738 280 H828 q14 0 14 -14 V206 q0 -12 12 -12 H870" />
          <path d="M738 320 H848 q14 0 14 14 V352 q0 12 12 12 H900" />
        </g>
        <g fill="#3DE296">
          {([[330, 194, .9], [300, 364, .6], [870, 194, .9], [900, 364, .6]] as [number, number, number][]).map(([x, y, o]) => (
            <g key={`${x}-${y}`}><circle cx={x} cy={y} r={7} opacity={o * 0.18} /><circle cx={x} cy={y} r={2.8} opacity={o} /></g>
          ))}
        </g>

        {/* reflection on the floor + contact shadow + bloom */}
        <g opacity=".7" filter="url(#h-blur4)">
          <path d="M470 356 H730 V378 Q730 404 700 404 H500 Q470 404 470 378 Z" fill="url(#h-refl)" />
          <path d="M556 358 h22 v26 h-22z M598 358 h22 v18 h-22z M640 358 h22 v32 h-22z" fill="#08C465" opacity=".18" />
        </g>
        <ellipse cx="600" cy="360" rx="230" ry="50" fill="url(#h-glow)" />
        <ellipse cx="600" cy="350" rx="160" ry="20" fill="#08C465" opacity=".38" filter="url(#h-blur22)" />
        <ellipse cx="600" cy="352" rx="150" ry="9" fill="#000" opacity=".75" filter="url(#h-blur8)" />

        {/* block: front face */}
        <path d={frontFace} fill="url(#h-front)" />
        <path d={frontFace} fill="url(#h-frontv)" />
        <g clipPath="url(#h-frontclip)">
          <rect x="494" y="276" width="212" height="46" rx="12" fill="none" stroke="#fff" strokeOpacity=".06" />
          <path d="M494 277 H706" stroke="#000" strokeOpacity=".5" />
          {[0, 1, 2, 3, 4, 5].map(i => <circle key={i} cx={516 + i * 12} cy={299} r={2.2} fill={i < 4 ? '#08C465' : '#fff'} opacity={i < 4 ? 0.85 - i * 0.12 : 0.12} />)}
          <text x="690" y="303" textAnchor="end" style={{ fontFamily: "var(--mono)" }} fontSize="10.5" fill="#fff" fillOpacity=".3" letterSpacing=".5">MT5 · read-only</text>
          <path d="M470 262 L520 350" stroke="#fff" strokeOpacity=".05" strokeWidth="26" />
        </g>
        <path d="M494 350 H706" stroke="#3DE296" strokeOpacity=".6" strokeWidth="1.2" />
        <path d="M463 262 V318 Q463 349 494 349.5" fill="none" stroke="#3DE296" strokeOpacity=".55" strokeWidth="1.3" />
        <path d="M737 262 V318 Q737 349 706 349.5" fill="none" stroke="#3DE296" strokeOpacity=".55" strokeWidth="1.3" />
        {/* bevel shadow between top and front */}
        <path d="M466 255 H734" stroke="#000" strokeOpacity=".7" strokeWidth="2" />

        {/* block: top face */}
        <path d={topFace} fill="url(#h-top)" />
        <path d={topFace} fill="url(#h-topglow)" />
        <g clipPath="url(#h-topclip)">
          {/* glass streaks */}
          <path d="M520 150 L470 260" stroke="#fff" strokeOpacity=".06" strokeWidth="34" />
          <path d="M572 150 L536 260" stroke="#fff" strokeOpacity=".035" strokeWidth="10" />
          {/* inset bevel */}
          <path d="M516 168 H684 Q700 168 706 183 L726 235 Q730 246 716 246 H484 Q470 246 474 235 L494 183 Q500 168 516 168 Z" fill="none" stroke="#fff" strokeOpacity=".07" />
          {/* engraved bracket marks: groove + lit edge */}
          <g transform="translate(600 210) scale(1 .4)" fill="none" strokeLinecap="round" strokeLinejoin="round">
            <g stroke="#000" strokeOpacity=".7" strokeWidth="9"><path d="M-104 -66 H-124 V66 H-104" /><path d="M104 -66 H124 V66 H104" /></g>
            <g stroke="#fff" strokeOpacity=".5" strokeWidth="3" transform="translate(0 3)"><path d="M-104 -66 H-124 V66 H-104" /><path d="M104 -66 H124 V66 H104" /></g>
          </g>
        </g>
        <path d="M512 160.6 H688" stroke="url(#h-backrim)" strokeWidth="1.4" />
        <path d="M462 238 Q458 253.4 478 253.4 H722 Q742 253.4 738 238" fill="none" stroke="url(#h-rim)" strokeWidth="2.2" />
        <path d="M478 254.6 H722" stroke="#C8FFE2" strokeOpacity=".35" strokeWidth="1" filter="url(#h-blur4)" />

        {/* candles standing on the top face */}
        <Candle x={548} base={222} h={58} up />
        <Candle x={590} base={226} h={40} up={false} />
        <Candle x={632} base={220} h={74} up />

        {/* specular sparkles */}
        {([[742, 236, 1], [458, 240, .7], [690, 162, .6]] as [number, number, number][]).map(([x, y, o]) => (
          <path key={`${x}`} d={`M${x} ${y - 7} L${x + 1.4} ${y - 1.4} L${x + 7} ${y} L${x + 1.4} ${y + 1.4} L${x} ${y + 7} L${x - 1.4} ${y + 1.4} L${x - 7} ${y} L${x - 1.4} ${y - 1.4} Z`} fill="#fff" opacity={o} />
        ))}

        {/* orbit ring, front half (in front of the block) */}
        <path d="M220 300 A380 74 0 0 0 980 300" fill="none" stroke="url(#h-orbit)" strokeWidth="1.3" />
        <circle cx="430" cy="364" r="3.5" fill="#3DE296" />
        <circle cx="430" cy="364" r="9" fill="#3DE296" opacity=".18" />
        <circle cx="812" cy="358" r="2.6" fill="#fff" opacity=".7" />
      </svg>

      {/* frosted chips with micro UI */}
      <Chip x={150} y={112} sym="MT5" title="Account synced" sub="History backfilled" extra={<span className="dot" />} />
      <Chip x={880} y={112} icon="mail" title="Weekly review ready" sub="One thing to fix" extra={<span className="t">Sat</span>} />
      <Chip x={120} y={392} sym="XAU" dim title="Trade journaled" sub="Notes · tags · replay"
        extra={<svg className="spark" width="44" height="18" viewBox="0 0 44 18" aria-hidden><polyline points="1,14 8,11 14,12 21,6 28,8 35,3 43,4" fill="none" stroke="#3DE296" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>} />
      <Chip x={904} y={392} dim icon="flame" title="Tilt check" sub="Behaviour score updated" />
    </>
  );
}
