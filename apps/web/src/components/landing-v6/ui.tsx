import type { CSSProperties, ReactNode } from 'react';
import { Ic, type IconName } from './icons';

export type Tone = 'green' | 'red' | 'gray';

export function Label({ tone = 'green', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`label ${tone === 'green' ? '' : tone}`}><i />{children}</span>;
}

/** Glossy icon tile — the one master used everywhere (gloss, inner shadow, underglow). */
export function IconTile({ icon, tone = 'green', size, style }: { icon: IconName; tone?: Tone; size?: 'xs' | 'sm' | 'lg'; style?: CSSProperties }) {
  return (
    <span className={`it ${tone === 'green' ? '' : tone} ${size ?? ''}`} style={style} aria-hidden>
      <Ic name={icon} />
    </span>
  );
}

/** Bento tile: icon tile + ghosted glyph, then **bold words** + regular words. */
export function Tile({ icon, tone = 'green', bold, rest }: { icon: IconName; tone?: Tone; bold: string; rest: string }) {
  return (
    <div className="tile">
      <div className="tile-top">
        <IconTile icon={icon} tone={tone} />
        <span className="tile-ghost" aria-hidden><Ic name={icon} stroke={1.4} /></span>
      </div>
      <p className="tile-t"><b>{bold}</b> {rest}</p>
    </div>
  );
}

export function SecHead({ id, label, tone = 'green', title, body, action }: {
  id?: string; label: string; tone?: Tone; title: ReactNode; body: string; action?: { href: string; text: string };
}) {
  return (
    <div className="sec-head">
      <div>
        <Label tone={tone}>{label}</Label>
        <h2 id={id ? `${id}-h` : undefined}>{title}</h2>
      </div>
      <div>
        <p>{body}</p>
        {action && <div className="act"><a className="btn btn-dark" href={action.href}>{action.text}</a></div>}
      </div>
    </div>
  );
}

/** Two-by-two tiles + one art panel. `flip` puts the art on the left. */
export function Bento({ flip, tiles, art }: { flip?: boolean; tiles: ReactNode; art: ReactNode }) {
  return (
    <div className={`bento ${flip ? 'flip' : ''}`}>
      {flip && art}
      <div className="tiles">{tiles}</div>
      {!flip && art}
    </div>
  );
}

export function Sample({ style }: { style: CSSProperties }) {
  return <span className="sample" style={style} aria-hidden>Sample</span>;
}

/** Frosted floating chip used inside art panels (decorative; the art is aria-hidden). */
export function Chip({ x, y, sym, icon, symStyle, title, sub, value, valueTone, dim, red, extra, style }: {
  x: number; y: number; sym?: string; icon?: IconName; symStyle?: CSSProperties; title: ReactNode; sub?: ReactNode;
  value?: string; valueTone?: 'pos' | 'neg'; dim?: boolean; red?: boolean; extra?: ReactNode; style?: CSSProperties;
}) {
  return (
    <div className={`chip ${dim ? 'dim' : ''} ${red ? 'red-t' : ''}`} style={{ left: x, top: y, ...style }}>
      {(sym || icon) && <span className="sym" style={symStyle}>{icon ? <Ic name={icon} size={15} /> : sym}</span>}
      <div>{title}{sub && <small>{sub}</small>}</div>
      {value && <span className={`v ${valueTone ?? ''}`}>{value}</span>}
      {extra}
    </div>
  );
}

/** Deterministic pseudo-random sequence so server and client render the same art. */
export function seeded(seed: number) {
  let s = seed;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}
