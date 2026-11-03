// Card widths for a 12-column grid in a user-chosen order: walk the rows and,
// when the next card doesn't fit, stretch that row's last card to the edge, so
// every row is full whatever order the cards were dragged into. Pure.
export function packRows<K extends string>(order: readonly K[], spans: Record<K, number>, cols = 12): Record<K, number> {
  const out = {} as Record<K, number>;
  let used = 0;
  let last: K | null = null;
  for (const id of order) {
    const s = Math.min(cols, spans[id]);
    if (used > 0 && used + s > cols && last) { out[last] += cols - used; used = 0; }
    out[id] = s;
    used += s;
    last = id;
    if (used >= cols) used = 0;
  }
  if (used > 0 && last) out[last] += cols - used;
  return out;
}
