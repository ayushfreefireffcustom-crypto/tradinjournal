// Collision-free placement for the chart's text (E). Pure, so it's unit-tested:
// labels go in priority order, each tries its candidate spots (then its short
// text); the first spot that hits nothing already placed wins, otherwise the
// label is dropped (its marker stays; tap/hover shows the text). Axis tags are
// nudged up/down off each other and off the live price tag.

export interface Box { x: number; y: number; w: number; h: number }
export interface Cand { dx: number; dy: number; align: 'left' | 'center' | 'right' }
export type Region = 'plot' | 'lane1' | 'lane2';

export interface LabelIn {
  id: string;
  prio: number;
  /** Anchor point in pane pixels. */
  ax: number;
  ay: number;
  /** Box width for the full text and for the short text (if any). */
  w: number;
  sw?: number;
  h: number;
  cands: Cand[];
  region: Region;
}

export interface Area {
  width: number;
  /** Plot labels stay between these (legend above, event lane below). */
  plotTop: number;
  plotBottom: number;
  /** Centre lines of the two lane rows. */
  lane1: number;
  lane2: number;
}

export interface Placed { id: string; box: Box; short: boolean }

export const overlaps = (a: Box, b: Box, m = 2) =>
  a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;

function boxFor(l: LabelIn, c: Cand, w: number, area: Area): Box | null {
  let x = c.align === 'left' ? l.ax + c.dx : c.align === 'right' ? l.ax + c.dx - w : l.ax + c.dx - w / 2;
  // Slide back inside the pane (a label never runs under the price axis).
  x = Math.max(2, Math.min(x, area.width - 2 - w));
  if (w > area.width - 4) return null;
  let y: number;
  if (l.region === 'plot') {
    y = l.ay + c.dy - l.h / 2;
    if (y < area.plotTop) { if (area.plotTop - y > 14) return null; y = area.plotTop; }
    if (y + l.h > area.plotBottom) { if (y + l.h - area.plotBottom > 14) return null; y = area.plotBottom - l.h; }
  } else {
    y = (l.region === 'lane1' ? area.lane1 : area.lane2) - l.h / 2;
  }
  return { x, y, w, h: l.h };
}

/** Places labels by priority (lower number first); returns where each went and which were dropped. */
export function placeLabels(labels: LabelIn[], area: Area, obstacles: Box[] = []): { placed: Placed[]; dropped: string[] } {
  const order = labels.map((l, i) => ({ l, i })).sort((a, b) => a.l.prio - b.l.prio || a.i - b.i);
  const taken: Box[] = [...obstacles];
  const placed: Placed[] = [];
  const dropped: string[] = [];
  for (const { l } of order) {
    let done = false;
    for (const [w, short] of [[l.w, false], ...(l.sw != null ? [[l.sw, true] as const] : [])] as Array<readonly [number, boolean]>) {
      for (const c of l.cands) {
        const b = boxFor(l, c, w, area);
        if (b && !taken.some(t => overlaps(b, t))) {
          taken.push(b);
          placed.push({ id: l.id, box: b, short });
          done = true;
          break;
        }
      }
      if (done) break;
    }
    if (!done) dropped.push(l.id);
  }
  return { placed, dropped };
}

export interface TagIn { id: string; prio: number; y: number; h: number }

/**
 * Vertical spots for price-axis tags: each tag moves the least distance (up
 * to `maxShift`) that clears the tags already placed and the reserved bands
 * (the live price tag and its countdown). Tags that can't fit are dropped.
 */
export function placeTags(tags: TagIn[], height: number, reserved: Array<{ y0: number; y1: number }> = [], maxShift = 40): Map<string, number> {
  const out = new Map<string, number>();
  const busy = reserved.map(r => ({ y0: r.y0, y1: r.y1 }));
  const order = [...tags].sort((a, b) => a.prio - b.prio);
  for (const t of order) {
    if (t.y < -t.h || t.y > height + t.h) continue;
    for (let k = 0; k <= maxShift * 2; k++) {
      const off = k % 2 ? (k + 1) / 2 : -k / 2; // 0, +1, -1, +2, -2 …
      const c = t.y + off;
      const y0 = c - t.h / 2, y1 = c + t.h / 2;
      if (y0 < 0 || y1 > height) continue;
      if (busy.some(b => y0 < b.y1 + 1 && b.y0 < y1 + 1)) continue;
      busy.push({ y0, y1 });
      out.set(t.id, c);
      break;
    }
  }
  return out;
}

/** Nearest marker within `r` px of a tap or pointer. */
export function hitTest<T extends { x: number; y: number }>(hits: T[], x: number, y: number, r = 14): T | null {
  let best: T | null = null;
  let bd = r * r;
  for (const h of hits) {
    const d = (h.x - x) ** 2 + (h.y - y) ** 2;
    if (d <= bd) { bd = d; best = h; }
  }
  return best;
}
