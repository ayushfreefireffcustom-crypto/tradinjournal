// Still drawings for empty states, one per kind of page. Nothing moves or glows; each one shows
// the thing that will fill the space, waiting. Colours come from the --art-* tokens (tokens.css),
// so they hold in both themes. Drawn on a 200 × 140 board to sit inside the round disc.
import type { ReactNode } from 'react';

export type SceneKind =
  | 'search' | 'signal' | 'pulse' | 'compare' | 'bell' | 'news' | 'play' | 'report' | 'calendar'
  | 'star' | 'plug' | 'lock' | 'note' | 'shield' | 'chat';

const P = 'var(--art-paper)', P2 = 'var(--art-paper-2)', P3 = 'var(--art-paper-3)';
const E = 'var(--art-edge)', E2 = 'var(--art-edge-2)', INK = 'var(--art-ink)', LN = 'var(--art-line)', WK = 'var(--art-wick)';
const G = 'var(--d2-g)', R = 'var(--d2-r)';

const Shadow = ({ rx = 70 }: { rx?: number }) => <ellipse cx="100" cy="128" rx={rx} ry="5" fill="var(--art-shadow)" />;
/** A card with a title bar, the base of most scenes. */
const Card = ({ x = 30, y = 26, w = 140, h = 96 }: { x?: number; y?: number; w?: number; h?: number }) => (
  <>
    <rect x={x} y={y} width={w} height={h} rx="13" fill={P} stroke={E} />
    <rect x={x + 12} y={y + 12} width="30" height="7" rx="3.5" fill={INK} />
  </>
);
const Bar = ({ x, y, w, c = LN, o }: { x: number; y: number; w: number; c?: string; o?: number }) => <rect x={x} y={y} width={w} height="6" rx="3" fill={c} opacity={o} />;
const Candle = ({ x, top, bot, b0, b1, up }: { x: number; top: number; bot: number; b0: number; b1: number; up: boolean }) => (
  <>
    <path d={`M${x} ${top}V${bot}`} stroke={WK} strokeWidth="1.2" strokeLinecap="round" />
    <rect x={x - 2.5} y={b0} width="5" height={b1 - b0} rx="1.1" fill={up ? G : R} />
  </>
);

const SCENES: Record<SceneKind, () => ReactNode> = {
  /** Rows of a table under a lens that has found nothing. */
  search: () => (
    <>
      <Shadow />
      <Card />
      {[52, 70, 88].map((y, i) => <g key={y}><circle cx="48" cy={y + 3} r="4" fill={LN} /><Bar x={58} y={y} w={46 - i * 8} /><Bar x={124} y={y} w={30} /></g>)}
      <circle cx="128" cy="84" r="23" fill={P2} fillOpacity=".92" stroke={INK} strokeWidth="3" />
      <path d="M118 84h20" stroke={WK} strokeWidth="2" strokeLinecap="round" strokeDasharray="2 4" />
      <path d="M145 101l13 13" stroke={INK} strokeWidth="5" strokeLinecap="round" />
    </>
  ),
  /** Candles with the next signal marked as a dashed slot at the right edge. */
  signal: () => (
    <>
      <Shadow />
      <Card />
      <Candle x={50} top={64} bot={98} b0={72} b1={90} up />
      <Candle x={64} top={70} bot={100} b0={76} b1={92} up={false} />
      <Candle x={78} top={58} bot={92} b0={64} b1={84} up />
      <Candle x={92} top={52} bot={86} b0={58} b1={76} up />
      <Candle x={106} top={60} bot={90} b0={66} b1={82} up={false} />
      <rect x="120" y="48" width="34" height="56" rx="8" fill="none" stroke={G} strokeWidth="1.4" strokeDasharray="3 3" />
      <path d="M137 86V66m-6 6 6-6 6 6" fill="none" stroke={G} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  /** A line that has gone flat, with one small beat. */
  pulse: () => (
    <>
      <Shadow />
      <Card />
      <path d="M44 86h34l6-16 8 30 7-22 5 8h52" fill="none" stroke={INK} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M44 104h112" stroke={LN} strokeWidth="1.4" strokeDasharray="2 5" strokeLinecap="round" />
    </>
  ),
  /** Two markets on one chart: one line green, one grey, crossing. */
  compare: () => (
    <>
      <Shadow />
      <rect x="40" y="18" width="128" height="88" rx="13" fill={P3} stroke={E2} />
      <Card x={30} y={30} w={140} h={92} />
      <path d="M44 100c12-6 18-18 32-20s22 10 36 2 20-26 44-32" fill="none" stroke={G} strokeWidth="2.2" strokeLinecap="round" />
      <path d="M44 74c14 2 22 12 36 14s24-6 36-4 22 12 40 10" fill="none" stroke={WK} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="96" cy="85" r="3.4" fill={P} stroke={INK} strokeWidth="1.6" />
    </>
  ),
  /** Price climbing toward a dashed level; the bell sits where it will cross. */
  bell: () => (
    <>
      <Shadow />
      <Card />
      <path d="M42 66h116" stroke={G} strokeWidth="1.4" strokeDasharray="4 4" strokeLinecap="round" />
      <path d="M44 108c8-2 12-12 20-12s10 8 18 4 10-18 18-20 10 8 18 2 8-12 12-14" fill="none" stroke={INK} strokeWidth="2.2" strokeLinecap="round" />
      <circle cx="130" cy="68" r="3.2" fill={P} stroke={INK} strokeWidth="1.6" />
      <g transform="translate(140 30)">
        <path d="M0 22c0-10 5-16 12-16s12 6 12 16v6l3 4H-3l3-4z" fill={P2} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M8 36a4 4 0 0 0 8 0" fill="none" stroke={INK} strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="12" cy="4" r="2" fill={INK} />
      </g>
    </>
  ),
  /** A small stack of articles: picture, headline, two lines. */
  news: () => (
    <>
      <Shadow />
      <rect x="44" y="16" width="118" height="86" rx="13" fill={P3} stroke={E2} transform="rotate(-5 100 60)" />
      <Card />
      <rect x="42" y="50" width="40" height="30" rx="7" fill={LN} />
      <path d="M46 76l10-10 8 6 6-4 10 8" fill="none" stroke={WK} strokeWidth="1.4" strokeLinejoin="round" />
      <Bar x={90} y={52} w={66} c={INK} o={0.75} />
      <Bar x={90} y={64} w={52} />
      <Bar x={90} y={74} w={58} />
      <Bar x={42} y={92} w={110} />
      <Bar x={42} y={104} w={78} />
    </>
  ),
  /** A strategy as three steps joined up, ready to run. */
  play: () => (
    <>
      <Shadow />
      <Card />
      <rect x="42" y="52" width="36" height="22" rx="7" fill={P2} stroke={E} />
      <rect x="92" y="52" width="36" height="22" rx="7" fill={P2} stroke={E} />
      <rect x="67" y="88" width="36" height="22" rx="7" fill={P2} stroke={E} />
      <Bar x={49} y={60} w={22} />
      <Bar x={99} y={60} w={22} />
      <Bar x={74} y={96} w={22} />
      <path d="M78 63h14M110 74v6c0 4-3 6-7 8M60 74v6c0 4 3 6 7 8" fill="none" stroke={WK} strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="148" cy="94" r="14" fill={G} />
      <path d="M144 87v14l11-7z" fill={P} />
    </>
  ),
  /** A bar chart whose bars are still outlines. */
  report: () => (
    <>
      <Shadow />
      <Card />
      <path d="M44 108h112" stroke={LN} strokeWidth="1.5" strokeLinecap="round" />
      {[[50, 30], [70, 44], [90, 24], [110, 52], [130, 38]].map(([x, h], i) => (
        <rect key={i} x={x} y={106 - h!} width="14" height={h} rx="4" fill="none" stroke={WK} strokeWidth="1.3" strokeDasharray="3 3" />
      ))}
      <rect x="130" y="68" width="14" height="38" rx="4" fill={G} fillOpacity=".85" />
    </>
  ),
  /** A month with nothing on it, today ringed. */
  calendar: () => (
    <>
      <Shadow />
      <rect x="30" y="22" width="140" height="100" rx="13" fill={P} stroke={E} />
      <rect x="30" y="22" width="140" height="22" rx="13" fill={P2} />
      <path d="M30 44h140" stroke={E} />
      <path d="M58 16v14M142 16v14" stroke={INK} strokeWidth="3" strokeLinecap="round" />
      {Array.from({ length: 18 }, (_, i) => {
        const c = i % 6, r = Math.floor(i / 6), x = 42 + c * 21, y = 54 + r * 21;
        return i === 10
          ? <g key={i}><rect x={x - 2} y={y - 2} width="18" height="18" rx="6" fill="none" stroke={G} strokeWidth="1.4" strokeDasharray="3 2" /><circle cx={x + 7} cy={y + 7} r="2.6" fill={G} /></g>
          : <rect key={i} x={x} y={y} width="14" height="14" rx="4" fill={LN} />;
      })}
    </>
  ),
  /** A watchlist with an empty star waiting to be ticked. */
  star: () => (
    <>
      <Shadow />
      <Card />
      {[52, 72, 92].map((y, i) => <g key={y}><Bar x={42} y={y + 2} w={50 - i * 8} /><Bar x={118} y={y + 2} w={20} c={i === 1 ? R : G} o={0.6} /></g>)}
      <path d="M148 90l5.3 10.8 11.9 1.7-8.6 8.4 2 11.8-10.6-5.6-10.6 5.6 2-11.8-8.6-8.4 11.9-1.7z" fill={P2} stroke={INK} strokeWidth="1.8" strokeLinejoin="round" />
    </>
  ),
  /** A plug short of its socket. */
  plug: () => (
    <>
      <Shadow rx={78} />
      <rect x="26" y="50" width="52" height="44" rx="12" fill={P} stroke={E} />
      <rect x="40" y="62" width="6" height="20" rx="3" fill={LN} />
      <rect x="58" y="62" width="6" height="20" rx="3" fill={LN} />
      <path d="M108 66h-10M108 78h-10" stroke={WK} strokeWidth="3" strokeLinecap="round" />
      <rect x="108" y="56" width="30" height="32" rx="9" fill={P2} stroke={INK} strokeWidth="1.6" />
      <path d="M138 72h10c10 0 14 8 14 18v22" fill="none" stroke={WK} strokeWidth="3.2" strokeLinecap="round" />
      <path d="M86 58l-4-5M88 72h-6M86 86l-4 5" stroke={G} strokeWidth="1.8" strokeLinecap="round" />
    </>
  ),
  /** Content behind a padlock. */
  lock: () => (
    <>
      <Shadow />
      <Card />
      <Bar x={42} y={52} w={70} />
      <Bar x={42} y={64} w={54} />
      <Bar x={42} y={76} w={62} />
      <path d="M128 76v-8a12 12 0 0 1 24 0v8" fill="none" stroke={INK} strokeWidth="3" />
      <rect x="120" y="76" width="40" height="32" rx="8" fill={P2} stroke={INK} strokeWidth="1.8" />
      <circle cx="140" cy="89" r="3.4" fill={INK} />
      <path d="M140 92v7" stroke={INK} strokeWidth="2.4" strokeLinecap="round" />
    </>
  ),
  /** A lined page and a pencil resting on it. */
  note: () => (
    <>
      <Shadow />
      <rect x="38" y="18" width="116" height="104" rx="12" fill={P} stroke={E} />
      {[44, 58, 72, 86, 100].map((y, i) => <path key={y} d={`M52 ${y}h${i === 0 ? 40 : 88}`} stroke={i === 0 ? INK : LN} strokeWidth={i === 0 ? 4 : 1.6} strokeLinecap="round" />)}
      <g transform="rotate(-38 136 96)">
        <rect x="104" y="90" width="58" height="12" rx="3" fill={P2} stroke={INK} strokeWidth="1.6" />
        <path d="M162 90l12 6-12 6z" fill={INK} />
        <rect x="104" y="90" width="9" height="12" rx="2" fill={G} />
      </g>
    </>
  ),
  /** A shield with a tick. */
  shield: () => (
    <>
      <Shadow rx={56} />
      <path d="M100 16l44 15v30c0 30-19 50-44 60-25-10-44-30-44-60V31z" fill={P} stroke={E} strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M100 30l30 10v22c0 20-12 34-30 42-18-8-30-22-30-42V40z" fill={P2} stroke={E2} strokeLinejoin="round" />
      <path d="M86 68l10 10 19-21" fill="none" stroke={G} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  /** A question asked and the answer still to come. */
  chat: () => (
    <>
      <Shadow />
      <rect x="64" y="20" width="96" height="34" rx="14" fill={P2} stroke={E} />
      <Bar x={78} y={30} w={62} c={INK} o={0.75} />
      <Bar x={78} y={40} w={40} />
      <rect x="36" y="66" width="112" height="52" rx="14" fill={P} stroke={E} />
      <Bar x={50} y={78} w={76} />
      <Bar x={50} y={90} w={60} />
      <rect x="50" y="102" width="34" height="6" rx="3" fill={G} opacity=".7" />
    </>
  ),
};

/** The drawing alone (no disc). */
export function SceneArt({ kind }: { kind: SceneKind }) {
  return <svg viewBox="0 0 200 140" className="st-art" aria-hidden>{SCENES[kind]()}</svg>;
}

/** The drawing in its round disc, as used at the top of a centred state. */
export function SceneDisc({ kind, children, size }: { kind?: SceneKind; children?: ReactNode; size?: 'sm' | 'xs' }) {
  return <div className={`st-disc${size ? ` st-disc--${size}` : ''}`} aria-hidden>{children ?? (kind && <SceneArt kind={kind} />)}</div>;
}
