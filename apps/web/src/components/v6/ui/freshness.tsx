'use client';

// "Updated 12s ago" for market data (QW.16): how old the numbers on screen are,
// ticking while the page is open, with the exact time on hover.
import { useEffect, useState } from 'react';

export function agoLabel(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 10) return 'just now';
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.floor(h / 24)} d ago`;
}

export default function Freshness({ at, prefix = 'Updated' }: { at: string | number | null | undefined; prefix?: string }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 10_000);
    return () => clearInterval(t);
  }, []);
  if (at == null) return null;
  const t = typeof at === 'number' ? at : new Date(at).getTime();
  if (!Number.isFinite(t)) return null;
  return (
    <span className="x-fresh" title={new Date(t).toLocaleString()} data-testid="freshness">
      {prefix} {agoLabel(now - t)}
    </span>
  );
}
