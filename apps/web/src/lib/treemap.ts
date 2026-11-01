// Squarified treemap (Bruls, Huizing & van Wijk): lays out weighted items in a
// rectangle with tiles as close to square as the weights allow. Pure.
export interface Rect { x: number; y: number; w: number; h: number }

export function squarify<T>(items: T[], weight: (t: T) => number, box: Rect): Array<{ item: T; rect: Rect }> {
  const list = items.map((item) => ({ item, w: Math.max(0, weight(item)) })).filter((x) => x.w > 0).sort((a, b) => b.w - a.w);
  const total = list.reduce((s, x) => s + x.w, 0);
  if (!total || box.w <= 0 || box.h <= 0) return [];
  const scale = (box.w * box.h) / total;
  const areas = list.map((x) => ({ item: x.item, a: x.w * scale }));
  const out: Array<{ item: T; rect: Rect }> = [];
  let free = { ...box };
  const worst = (row: number[], side: number) => {
    const sum = row.reduce((s, a) => s + a, 0);
    const max = Math.max(...row);
    const min = Math.min(...row);
    return Math.max((side * side * max) / (sum * sum), (sum * sum) / (side * side * min));
  };
  let row: typeof areas = [];
  const place = () => {
    const sum = row.reduce((s, r) => s + r.a, 0);
    const horizontal = free.w >= free.h; // lay the row along the short side
    if (horizontal) {
      const colW = sum / free.h;
      let y = free.y;
      for (const r of row) { const h = r.a / colW; out.push({ item: r.item, rect: { x: free.x, y, w: colW, h } }); y += h; }
      free = { x: free.x + colW, y: free.y, w: free.w - colW, h: free.h };
    } else {
      const rowH = sum / free.w;
      let x = free.x;
      for (const r of row) { const w = r.a / rowH; out.push({ item: r.item, rect: { x, y: free.y, w, h: rowH } }); x += w; }
      free = { x: free.x, y: free.y + rowH, w: free.w, h: free.h - rowH };
    }
    row = [];
  };
  for (const a of areas) {
    const side = Math.min(free.w, free.h);
    if (!row.length || worst([...row.map((r) => r.a), a.a], side) <= worst(row.map((r) => r.a), side)) row.push(a);
    else { place(); row.push(a); }
  }
  if (row.length) place();
  return out;
}
