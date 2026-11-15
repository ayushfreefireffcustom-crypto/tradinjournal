'use client';

// Price-path mini chart for a trade-log row: entry fill → bar closes → exit
// fill, with the stop / target lines when the close says one was hit. Paths
// load only for rows on screen, batched into one POST /insights/tradelog/paths
// per ~30 rows, and stay cached for the session (a closed trade never changes).
import { useEffect, useRef, useState } from 'react';
import { pathGeom, tradelogApi, type TlPath, type TlRow } from '@/lib/tradelog-v2-api';
import { toneColor } from '@/lib/dashboard-v2-format';

type Entry = TlPath | null;
const cache = new Map<string, Entry>();
const waiters = new Map<string, Set<(p: Entry) => void>>();
const queue = new Map<string, Set<string>>(); // accountId → ids
let timer: ReturnType<typeof setTimeout> | null = null;
const BATCH = 30;

function flush() {
  timer = null;
  for (const [acc, set] of queue) {
    queue.delete(acc);
    const ids = [...set];
    for (let i = 0; i < ids.length; i += BATCH) {
      const chunk = ids.slice(i, i + BATCH);
      tradelogApi.paths(acc, chunk)
        .then(r => chunk.forEach(id => settle(acc, id, r.paths[id] ?? null)))
        .catch(() => chunk.forEach(id => settle(acc, id, null, false)));
    }
  }
}
function settle(acc: string, id: string, p: Entry, keep = true) {
  const k = `${acc}:${id}`;
  if (keep) cache.set(k, p);
  const ws = waiters.get(k);
  waiters.delete(k);
  ws?.forEach(f => f(p));
}
/** Ask for a path; `cb` runs once with the result (cached results answer at once). */
export function requestPath(acc: string, id: string, cb: (p: Entry) => void): () => void {
  const k = `${acc}:${id}`;
  if (cache.has(k)) { cb(cache.get(k)!); return () => {}; }
  const ws = waiters.get(k) ?? waiters.set(k, new Set()).get(k)!;
  ws.add(cb);
  if (ws.size === 1) {
    (queue.get(acc) ?? queue.set(acc, new Set()).get(acc)!).add(id);
    if (!timer) timer = setTimeout(flush, 80);
  }
  return () => { ws.delete(cb); };
}
export const cachedPath = (acc: string, id: string): Entry | undefined => cache.get(`${acc}:${id}`);

/** Loads the path once the element scrolls near the viewport. */
export function usePath(acc: string | null, row: Pick<TlRow, 'id' | 'status'>): [React.RefObject<HTMLSpanElement | null>, Entry | undefined] {
  const ref = useRef<HTMLSpanElement>(null);
  const closed = row.status === 'CLOSED';
  const [p, setP] = useState<Entry | undefined>(() => (acc && closed ? cachedPath(acc, row.id) : null));
  useEffect(() => {
    if (!acc || !closed) { setP(null); return; }
    const hit = cachedPath(acc, row.id);
    if (hit !== undefined) { setP(hit); return; }
    setP(undefined);
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return requestPath(acc, row.id, setP);
    let cancel: (() => void) | null = null;
    const io = new IntersectionObserver(es => {
      if (es.some(e => e.isIntersecting)) { io.disconnect(); cancel = requestPath(acc, row.id, setP); }
    }, { rootMargin: '240px 0px' });
    io.observe(el);
    return () => { io.disconnect(); cancel?.(); };
  }, [acc, row.id, closed]);
  return [ref, p];
}

export function MiniPath({ accountId, row, w: w0 = 100, h = 26, fluid = false, className = '' }: { accountId: string | null; row: TlRow; w?: number; h?: number; fluid?: boolean; className?: string }) {
  const [ref, p] = usePath(accountId, row);
  const [mw, setMw] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!fluid || !el || typeof ResizeObserver === 'undefined') return;
    const set = () => setMw(Math.floor(el.getBoundingClientRect().width));
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, [fluid, ref]);
  const w = fluid && mw > 20 ? mw : w0;
  const tone = toneColor(row.net, 'var(--d2-g)', 'var(--d2-r)');
  let body: React.ReactNode;
  if (p === undefined) body = <line x1={4} x2={w - 4} y1={h / 2} y2={h / 2} stroke="var(--line-2)" strokeDasharray="2 3" />;
  else if (!p) body = <text x={w / 2} y={h / 2 + 4} textAnchor="middle" fontSize={11} fill="var(--dim)">—</text>;
  else {
    const g = pathGeom(p, w, h);
    body = (
      <>
        <line x1={0} x2={w} y1={g.entryY} y2={g.entryY} stroke="var(--line-2)" strokeDasharray="1 2" />
        {g.tp != null && <line x1={0} x2={w} y1={g.tp} y2={g.tp} stroke="var(--d2-g)" strokeDasharray="2 2" strokeOpacity={0.8} />}
        {g.sl != null && <line x1={0} x2={w} y1={g.sl} y2={g.sl} stroke="var(--d2-r)" strokeDasharray="2 2" strokeOpacity={0.8} />}
        <path d={g.d} fill="none" stroke={tone} strokeWidth={1.4} strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={g.end[0]} cy={g.end[1]} r={2} fill={tone} />
      </>
    );
  }
  const title = p === undefined ? 'Loading price path' : !p ? (row.status === 'OPEN' ? 'Still open' : 'No price data for this symbol') : `Price from entry to exit (${p.tf} bars)${p.sl != null ? ' · stop hit' : ''}${p.tp != null ? ' · target hit' : ''}`;
  return (
    <span ref={ref} className={`tl-path ${className}`} title={title} data-path={p === undefined ? 'loading' : p ? 'ok' : 'none'}>
      <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden>{body}</svg>
    </span>
  );
}
