// klinecharts overlays for the "Your trades" chart (E). Registered once per
// page load; the chart creates them in the `tl` group and redraws them from
// state after every reload. Colours come in through `extendData.pal` (resolved
// from the v6 tokens) so they follow the light/dark toggle.
import type { Coordinate, OverlayFigure, OverlayTemplate } from 'klinecharts';
import { placeLabels, placeTags, type Box, type Cand, type LabelIn, type Region } from './label-layout';

type KC = typeof import('klinecharts');

export interface Pal {
  g: string; r: string; gTx: string; rTx: string; tx: string; mut: string; dim: string;
  bg: string; s1: string; s2: string; s3: string; line: string; line2: string; hi: string; inv: string; font: string;
}

export function readPal(el: Element): Pal {
  const cs = getComputedStyle(el);
  const v = (n: string, f: string) => cs.getPropertyValue(n).trim() || f;
  return {
    g: v('--g', '#08C465'), r: v('--r', '#FE3A31'), gTx: v('--g-tx', '#08C465'), rTx: v('--r-tx', '#FE3A31'),
    tx: v('--tx', '#EDEDED'), mut: v('--mut', '#9A9A9A'), dim: v('--dim', '#6E6E6E'),
    bg: v('--bg', '#0A0A0A'), s1: v('--s1', '#131313'), s2: v('--s2', '#1A1A1A'), s3: v('--s3', '#232323'),
    line: v('--line', 'rgba(255,255,255,.07)'), line2: v('--line-2', 'rgba(255,255,255,.13)'),
    hi: v('--hi', '#EDEDED'), inv: v('--inv', '#0A0A0A'), font: v('--sans', 'Inter, system-ui, sans-serif'),
  };
}

/** `a` tinted toward `b` by t (solid, so a label hides the lines under it). */
export function mix(a: string, b: string, t: number): string {
  const pa = /^#([0-9a-f]{6})$/i.exec(a.trim()), pb = /^#([0-9a-f]{6})$/i.exec(b.trim());
  if (!pa || !pb) return a;
  const x = parseInt(pa[1]!, 16), y = parseInt(pb[1]!, 16);
  const ch = (sh: number) => Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t);
  return `rgb(${ch(16)}, ${ch(8)}, ${ch(0)})`;
}

export function alpha(color: string, a: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return color;
  const n = parseInt(m[1]!, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

// 24-unit stroke icons drawn on the canvas (same geometry family as the app's icons).
export const ICON = {
  note: 'M13 4H5v16h14v-7M17.5 3.5l3 3L12 15H9v-3z',
  warn: 'M12 3l9 16H3zM12 10v4M12 17h.01',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  bell: 'M6 16V11a6 6 0 0112 0v5l2 2H4zM10 20a2 2 0 004 0',
};

let measureCtx: CanvasRenderingContext2D | null = null;
/** Width of `text` at 11px in the given weight (for laying labels out side by side). */
export function textWidth(text: string, weight: number, font: string): number {
  if (typeof document === 'undefined') return text.length * 6.4;
  measureCtx ??= document.createElement('canvas').getContext('2d');
  if (!measureCtx) return text.length * 6.4;
  measureCtx.font = `${weight} 11px ${font}`;
  return measureCtx.measureText(text).width;
}

const none = 'transparent';
function txt(p: Pal, color: string, o: { bg?: string; border?: string; weight?: number; pad?: number } = {}) {
  const pad = o.pad ?? (o.bg || o.border ? 5 : 0);
  return {
    style: o.border ? 'stroke_fill' : 'fill', color, size: 11, family: p.font, weight: o.weight ?? 600,
    backgroundColor: o.bg ?? none, borderColor: o.border ?? none, borderSize: o.border ? 1 : 0, borderRadius: 4,
    borderStyle: 'solid', borderDashedValue: [2, 2],
    paddingLeft: pad, paddingRight: pad, paddingTop: o.bg || o.border ? 4 : 1, paddingBottom: o.bg || o.border ? 3 : 1,
  };
}
const line = (color: string, size = 1, dashed = false) => ({ style: dashed ? 'dashed' : 'solid', size, color, dashedValue: [4, 3] });
const fill = (color: string, border?: string) => ({ style: border ? 'stroke_fill' : 'fill', color, borderColor: border ?? none, borderSize: border ? 1 : 0, borderStyle: 'solid', borderDashedValue: [2, 2], borderRadius: 0 });
const icon = (x: number, y: number, size: number, path: string, color: string): OverlayFigure =>
  ({ type: 'tlIcon', attrs: { x, y, size, path }, styles: { color }, ignoreEvent: true });

export type TagKind = 'up' | 'down' | 'downSolid' | 'neutral' | 'muted';
/** A boxed tag on the price axis. */
function axisTag(p: Pal, y: number, width: number, text: string, kind: TagKind): OverlayFigure {
  const st = kind === 'up' ? txt(p, p.gTx, { bg: p.s2, border: p.g, weight: 700 })
    : kind === 'down' ? txt(p, p.rTx, { bg: p.s2, border: p.r, weight: 700 })
      : kind === 'downSolid' ? txt(p, '#FFFFFF', { bg: p.r, weight: 700 })
        : kind === 'muted' ? txt(p, p.tx, { bg: p.s3, weight: 600 })
          : txt(p, p.tx, { bg: p.s3, border: p.line2, weight: 700 });
  return { type: 'text', attrs: { x: 2, y, text, align: 'left', baseline: 'middle', width: Math.max(0, width - 4) }, styles: st, ignoreEvent: true };
}

// ─── extendData shapes ───────────────────────────────────────────────────────

export interface TradeExt { pal: Pal; side: 'LONG' | 'SHORT'; win: boolean }
export interface OpenExt { pal: Pal; side: 'LONG' | 'SHORT'; timed: boolean }
export interface HLineExt { pal: Pal; color: string; dashed: boolean; fromPoint?: boolean; opacity?: number }
export interface NoteExt { pal: Pal; /** Box offset from the point, px (negative = above). */ dy: number }
export interface EventExt { pal: Pal; high: boolean }
export interface RulerExt { pal: Pal; bell: boolean; onChange?: (v: { entry: number; stop: number; target: number }) => void }
export interface LiqExt { pal: Pal; bands: Array<{ price: number; longUsd: number; shortUsd: number }>; step: number; price: number }

/** One piece of text on the chart; placed by `tlLabels` with every other piece. */
export interface LabelSpec {
  id: string;
  /** Lower goes first: open trade 0, coach flag 1, SL/TP/ruler 2, recent trades 3, notes 4, AI levels 5, older trades 6, events 7. */
  prio: number;
  t?: number;
  v?: number;
  /** x from the pane edge instead of a time, or from the ruler zone. */
  x?: 'left' | 'right' | 'ruler';
  /** y at the bottom of the plot (above the lane). */
  y?: 'plotBottom';
  ox?: number;
  oy?: number;
  /** Anchor y never above this (pins are kept out of the legend). */
  minY?: number;
  text: string;
  short?: string;
  /** Text for the tap/hover popover (defaults to `text`). */
  tip?: string;
  color: string;
  bg?: string;
  border?: string;
  weight?: number;
  icon?: string;
  cands: Cand[];
  region?: Region;
  /** Tap target at the anchor (default: plot labels). */
  hit?: boolean;
}
export interface TagSpec { id: string; prio: number; v: number; text: string; kind: TagKind }
export interface Hit { x: number; y: number; text: string }
export interface LabelsExt {
  pal: Pal;
  labels: LabelSpec[];
  tags: TagSpec[];
  /** Marker boxes labels must not cover (note pins). */
  obstacles: Array<{ t: number; v: number; ox: number; oy: number; w: number; h: number }>;
  /** Phones: markers only, text on tap. */
  compact: boolean;
  /** Key into SINKS, where the layer leaves this frame's tap targets (extendData is copied, so no object refs). */
  sinkId: string;
  lastClose: number | null;
  countdown: boolean;
}

/** Tap targets per chart, refreshed on every draw. */
export const SINKS = new Map<string, Hit[]>();

/** Event lane geometry (inside the bottom gap of the price axis). */
export const LANE = { gap: 58, lane1: 9, lane2: 39, marker: 23, plotPad: 52 };
const LABEL_H = 17;

const ext = <E>(o: { extendData: unknown }) => o.extendData as E;
const tri = (x: number, y: number, long: boolean) => {
  const ty = long ? y + 6 : y - 6;
  return long ? [{ x, y: ty }, { x: x - 5.5, y: ty + 9 }, { x: x + 5.5, y: ty + 9 }] : [{ x, y: ty }, { x: x - 5.5, y: ty - 9 }, { x: x + 5.5, y: ty - 9 }];
};
/** Left edge of the ruler zone from the x of its points (they sit mid-way through the empty space). */
export const rulerLeft = (px: number, width: number) => Math.max(4, Math.min(2 * px - (width - 4) + 8, width - 4 - 110));

// ─── registration ───────────────────────────────────────────────────────────

let registered = false;

export function registerTlOverlays(kc: KC): void {
  if (registered) return;
  registered = true;

  kc.registerFigure<{ x: number; y: number; size: number; path: string }, { color: string }>({
    name: 'tlIcon',
    draw: (ctx, a, s) => {
      ctx.save();
      ctx.translate(a.x, a.y);
      const k = a.size / 24;
      ctx.scale(k, k);
      ctx.lineWidth = 1.7 / k;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = s.color;
      ctx.stroke(new Path2D(a.path));
      ctx.restore();
    },
    checkEventOn: () => false,
  });

  const base = { lock: true, needDefaultPointFigure: false, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false };

  // A closed trade: entry triangle, dashed path to the exit, exit dot (win) or cross (loss).
  kc.registerOverlay({
    name: 'tlTrade', totalStep: 3, ...base,
    createPointFigures: ({ overlay, coordinates }) => {
      const e = ext<TradeExt>(overlay);
      const p = e.pal;
      const [a, b] = coordinates as [Coordinate, Coordinate];
      if (!a || !b) return [];
      const out: OverlayFigure[] = [
        { type: 'line', attrs: { coordinates: [a, b] }, styles: line(alpha(p.tx, 0.7), 1, true), ignoreEvent: true },
        { type: 'polygon', attrs: { coordinates: tri(a.x, a.y, e.side === 'LONG') }, styles: fill(p.tx, p.bg), ignoreEvent: true },
      ];
      if (e.win) out.push({ type: 'circle', attrs: { x: b.x, y: b.y, r: 3.5 }, styles: fill(p.bg, p.tx), ignoreEvent: true });
      else out.push({ type: 'line', attrs: { coordinates: [{ x: b.x - 4, y: b.y - 4 }, { x: b.x + 4, y: b.y + 4 }] }, styles: line(p.r, 2), ignoreEvent: true },
        { type: 'line', attrs: { coordinates: [{ x: b.x + 4, y: b.y - 4 }, { x: b.x - 4, y: b.y + 4 }] }, styles: line(p.r, 2), ignoreEvent: true });
      return out;
    },
  } as OverlayTemplate);

  // The open position: entry line to the right edge and its triangle.
  kc.registerOverlay({
    name: 'tlOpen', totalStep: 2, ...base,
    createPointFigures: ({ overlay, coordinates, bounding }) => {
      const e = ext<OpenExt>(overlay);
      const c = coordinates[0];
      if (!c) return [];
      const x0 = e.timed ? Math.max(0, Math.min(c.x, bounding.width)) : 0;
      const out: OverlayFigure[] = [{ type: 'line', attrs: { coordinates: [{ x: x0, y: c.y }, { x: bounding.width, y: c.y }] }, styles: line(alpha(e.pal.tx, 0.75), 1), ignoreEvent: true }];
      if (e.timed && c.x >= 0 && c.x <= bounding.width) out.push({ type: 'polygon', attrs: { coordinates: tri(c.x, c.y, e.side === 'LONG') }, styles: fill(e.pal.tx, e.pal.bg), ignoreEvent: true });
      return out;
    },
  } as OverlayTemplate);

  // A horizontal level: stop/target of the open trade, AI support/resistance, liquidation price.
  kc.registerOverlay({
    name: 'tlHLine', totalStep: 2, ...base,
    createPointFigures: ({ overlay, coordinates, bounding }) => {
      const e = ext<HLineExt>(overlay);
      const c = coordinates[0];
      if (!c) return [];
      const x0 = e.fromPoint ? Math.max(0, c.x) : 0;
      return [{ type: 'line', attrs: { coordinates: [{ x: x0, y: c.y }, { x: bounding.width, y: c.y }] }, styles: line(alpha(e.color, e.opacity ?? 0.9), 1, e.dashed), ignoreEvent: true }];
    },
  } as OverlayTemplate);

  // A journal note's pin (its text is a label).
  kc.registerOverlay({
    name: 'tlNote', totalStep: 2, ...base,
    createPointFigures: ({ overlay, coordinates }) => {
      const e = ext<NoteExt>(overlay);
      const p = e.pal;
      const c = coordinates[0];
      if (!c) return [];
      const bx = c.x - 8, by = Math.max(24, c.y + e.dy); // never up in the legend
      return [
        { type: 'rect', attrs: { x: bx, y: by, width: 16, height: 16 }, styles: { ...fill(p.s2, p.line2), borderRadius: 4 }, ignoreEvent: true },
        icon(bx + 2, by + 2, 12, ICON.note, p.tx),
      ];
    },
  } as OverlayTemplate);

  // An economic event: a dashed line down to its marker in the lane.
  kc.registerOverlay({
    name: 'tlEvent', totalStep: 2, ...base,
    createPointFigures: ({ overlay, coordinates, bounding }) => {
      const e = ext<EventExt>(overlay);
      const p = e.pal;
      const c = coordinates[0];
      if (!c || c.x < 0 || c.x > bounding.width) return [];
      const col = e.high ? p.r : p.dim;
      const my = bounding.height - LANE.marker;
      return [
        { type: 'line', attrs: { coordinates: [{ x: c.x, y: 22 }, { x: c.x, y: my - 5 }] }, styles: line(alpha(col, e.high ? 0.5 : 0.35), 1, true), ignoreEvent: true },
        { type: 'rect', attrs: { x: c.x - 4, y: my - 4, width: 8, height: 8 }, styles: { ...fill(col), borderRadius: 1.5 }, ignoreEvent: true },
      ];
    },
  } as OverlayTemplate);

  // The risk ruler in the empty space right of the last bar. Drag a line to move
  // the entry, stop or target; drag inside to move the whole plan.
  kc.registerOverlay({
    name: 'tlRuler', totalStep: 4, lock: false, needDefaultPointFigure: true, needDefaultXAxisFigure: false, needDefaultYAxisFigure: false,
    createPointFigures: ({ overlay, coordinates, bounding }) => {
      const e = ext<RulerExt>(overlay);
      const p = e.pal;
      const [ce, cs, ct] = coordinates as [Coordinate, Coordinate, Coordinate];
      if (!ce || !cs || !ct) return [];
      const x1 = bounding.width - 4;
      const x0 = rulerLeft(ce.x, bounding.width);
      const w = x1 - x0;
      const out: OverlayFigure[] = [
        { type: 'rect', attrs: { x: x0, y: Math.min(ct.y, ce.y), width: w, height: Math.abs(ce.y - ct.y) }, styles: fill(alpha(p.g, 0.13)) },
        { type: 'rect', attrs: { x: x0, y: Math.min(cs.y, ce.y), width: w, height: Math.abs(ce.y - cs.y) }, styles: fill(alpha(p.r, 0.16)) },
        { type: 'line', attrs: { coordinates: [{ x: x0, y: ct.y }, { x: x1, y: ct.y }] }, styles: line(p.g, 1.25) },
        { type: 'line', attrs: { coordinates: [{ x: x0, y: cs.y }, { x: x1, y: cs.y }] }, styles: line(p.r, 1.25) },
        { type: 'line', attrs: { coordinates: [{ x: x0, y: ce.y }, { x: x1, y: ce.y }] }, styles: line(p.tx, 1.5) },
        { type: 'rect', attrs: { x: x0 - 3, y: ce.y - 3, width: 6, height: 6 }, styles: fill(p.tx), ignoreEvent: true },
        { type: 'rect', attrs: { x: x1 - 3, y: ce.y - 3, width: 6, height: 6 }, styles: fill(p.tx), ignoreEvent: true },
      ];
      if (e.bell) out.push(icon(x1 - 18, ce.y + 5, 13, ICON.bell, p.mut));
      return out;
    },
    // A point keeps its place in time; only its price moves.
    performEventPressedMove: ({ points, performPointIndex }) => {
      const pt = points[performPointIndex];
      const ts = (points[0] as { timestamp?: number })?.timestamp;
      if (pt && ts != null) pt.timestamp = ts;
    },
    onPressedMoveEnd: ({ overlay }) => {
      const e = ext<RulerExt>(overlay);
      const [a, b, c] = overlay.points;
      if (a?.value != null && b?.value != null && c?.value != null) e.onChange?.({ entry: a.value, stop: b.value, target: c.value });
    },
  } as OverlayTemplate);

  // Estimated liquidation bands behind the candles: longs below price in red,
  // shorts above in green, 4 steps of one hue by size.
  kc.registerOverlay({
    name: 'tlLiq', totalStep: 2, ...base, zLevel: -1,
    createPointFigures: ({ overlay, bounding, yAxis }) => {
      const e = ext<LiqExt>(overlay);
      const p = e.pal;
      if (!yAxis || !e.bands.length) return [];
      const max = Math.max(...e.bands.map(b => Math.max(b.longUsd, b.shortUsd)), 1);
      const steps = [0.07, 0.13, 0.2, 0.3];
      const out: OverlayFigure[] = [];
      for (const b of e.bands) {
        const below = b.price < e.price;
        const k = (below ? b.longUsd : b.shortUsd) / max;
        if (k < 0.12) continue;
        const a = steps[Math.min(3, Math.floor(k * 4))]!;
        const y0 = yAxis.convertToPixel(b.price + e.step / 2);
        const y1 = yAxis.convertToPixel(b.price - e.step / 2);
        if (y1 < 0 || y0 > bounding.height) continue;
        out.push({ type: 'rect', attrs: { x: 0, y: Math.min(y0, y1), width: bounding.width, height: Math.max(1, Math.abs(y1 - y0) - 1) }, styles: fill(alpha(below ? p.r : p.g, a)), ignoreEvent: true });
      }
      return out;
    },
  } as OverlayTemplate);

  // All text and all axis tags, laid out together so nothing overlaps.
  kc.registerOverlay({
    name: 'tlLabels', totalStep: 2, ...base, zLevel: 20,
    createPointFigures: ({ overlay, bounding, xAxis, yAxis }) => {
      const e = ext<LabelsExt>(overlay);
      const p = e.pal;
      const hits: Hit[] = [];
      SINKS.set(e.sinkId, hits);
      if (!xAxis || !yAxis) return [];
      const W = bounding.width, H = bounding.height;
      const xOf = (s: LabelSpec) => {
        if (s.x === 'left') return 6 + (s.ox ?? 0);
        if (s.x === 'right') return W - 6 + (s.ox ?? 0);
        if (s.t == null) return null;
        const x = xAxis.convertTimestampToPixel(s.t);
        return (s.x === 'ruler' ? rulerLeft(x, W) + 6 : x) + (s.ox ?? 0);
      };
      const yOf = (s: LabelSpec) => Math.max(s.minY ?? -Infinity, s.y === 'plotBottom' ? H - LANE.plotPad - 10 : s.v != null ? yAxis.convertToPixel(s.v) + (s.oy ?? 0) : 0);
      const area = { width: W, plotTop: 22, plotBottom: H - LANE.plotPad, lane1: H - LANE.lane1, lane2: H - LANE.lane2 };
      const obstacles: Box[] = e.obstacles.map(o => ({ x: xAxis.convertTimestampToPixel(o.t) + o.ox, y: Math.max(24, yAxis.convertToPixel(o.v) + o.oy), w: o.w, h: o.h }));
      const ins: LabelIn[] = [];
      const specs = new Map<string, LabelSpec>();
      for (const s of e.labels) {
        const ax = xOf(s);
        if (ax == null || ax < -40 || ax > W + 40) continue;
        const ay = yOf(s);
        const region = s.region ?? 'plot';
        if (region === 'plot' && (ay < -10 || ay > H)) continue;
        if (s.hit ?? region === 'plot') hits.push({ x: ax - (s.ox ?? 0), y: ay - (s.oy ?? 0), text: s.tip ?? s.text });
        if (e.compact && region === 'plot') continue; // phones: marker only
        const pad = 10 + (s.icon ? 17 : 0);
        ins.push({ id: s.id, prio: s.prio, ax, ay, w: textWidth(s.text, s.weight ?? 600, p.font) + pad, sw: s.short ? textWidth(s.short, s.weight ?? 600, p.font) + pad : undefined, h: LABEL_H, cands: s.cands, region });
        specs.set(s.id, s);
      }
      const { placed } = placeLabels(ins, area, obstacles);
      const out: OverlayFigure[] = [];
      for (const pl of placed) {
        const s = specs.get(pl.id)!;
        const st = txt(p, s.color, { bg: s.bg ?? p.bg, border: s.border, weight: s.weight ?? 600, pad: 5 });
        out.push({ type: 'text', attrs: { x: pl.box.x, y: pl.box.y, width: pl.box.w, height: pl.box.h, text: pl.short ? s.short! : s.text, align: 'left', baseline: 'top' }, styles: { ...st, paddingLeft: 5 + (s.icon ? 17 : 0), paddingTop: 3, paddingBottom: 3 }, ignoreEvent: true });
        if (s.icon) out.push(icon(pl.box.x + 5, pl.box.y + 2, 13, s.icon, s.color));
      }
      return out;
    },
    createYAxisFigures: ({ overlay, bounding, yAxis }) => {
      const e = ext<LabelsExt>(overlay);
      if (!yAxis || !e.tags.length) return [];
      const reserved: Array<{ y0: number; y1: number }> = [];
      if (e.lastClose != null) {
        const y = yAxis.convertToPixel(e.lastClose);
        reserved.push({ y0: y - 10, y1: y + (e.countdown ? 28 : 10) });
      }
      const pos = placeTags(e.tags.map(t => ({ id: t.id, prio: t.prio, y: yAxis.convertToPixel(t.v), h: 18 })), bounding.height, reserved);
      return e.tags.filter(t => pos.has(t.id)).map(t => axisTag(e.pal, pos.get(t.id)!, bounding.width, t.text, t.kind));
    },
  } as OverlayTemplate);
}
