'use client';

// Small shared pieces of the News page: move figures, the personal chip, the
// "TRADElogs AI" line and a size hook for the charts that draw at real pixels.
import { useEffect, useRef, useState, type RefObject } from 'react';
import { fmtMove, type Move } from '@/lib/news-map-api';

/** "BTCUSD −1.8%": ticker in small caps, the move in a heavy figure. */
export function Mv({ m, big }: { m: Move; big?: boolean }) {
  return (
    <span className={`nw-mv${big ? ' nw-mv--big' : ''}`}>
      <span className="nw-mv-s">{m.key}</span>
      <b className={`num nw-${m.dir}`}>{fmtMove(m)}</b>
    </span>
  );
}

export function You({ children }: { children: string }) {
  return <span className="nw-you">{children}</span>;
}

/** The AI label, e.g. "TRADELOGS AI · 6 sources", optionally with one short line. */
export function AiLine({ n, what = 'sources', text, className }: { n: number | string; what?: string; text?: string | null; className?: string }) {
  return (
    <p className={`nw-ail ${className ?? ''}`}>
      <span className="nw-ai"><b>TRADElogs AI</b> · <span className="num">{n}</span> {what}</span>
      {text && <span className="nw-ailt">{text}</span>}
    </p>
  );
}

/** Live content-box size of an element (0×0 until mounted). */
export function useSize<T extends HTMLElement>(): [RefObject<T | null>, { w: number; h: number }] {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const set = () => {
      const r = el.getBoundingClientRect();
      setSize(s => (Math.abs(s.w - r.width) < 0.5 && Math.abs(s.h - r.height) < 0.5 ? s : { w: Math.floor(r.width), h: Math.floor(r.height) }));
    };
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, size];
}

/** Ticks every `ms` while the tab is visible (drives the clock and countdowns). */
export function useNow(ms = 30_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) setNow(Date.now()); }, ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
