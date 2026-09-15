'use client';

export function GaugeRing({
  value,
  label,
  sub,
  tone = 'profit',
}: {
  value: number;
  label: string;
  sub?: string;
  tone?: 'profit' | 'loss' | 'warning' | 'neutral';
}) {
  const pct = Math.max(0, Math.min(100, value));
  const r = 36;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  const color =
    tone === 'loss' ? '#FE3A31' : tone === 'warning' ? '#FF9F0A' : tone === 'neutral' ? '#71717A' : '#08C465';

  return (
    <div className="tcard p-4 flex flex-col items-center min-w-0">
      <svg viewBox="0 0 100 100" className="w-24 h-24">
        <circle cx="50" cy="50" r={r} fill="none" stroke="#2A2A2A" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          transform="rotate(-90 50 50)"
          className="transition-all duration-700"
        />
        <text x="50" y="52" textAnchor="middle" className="fill-fg font-display font-black" fontSize="16">
          {Math.round(pct)}%
        </text>
      </svg>
      <div className="text-[10px] tracking-[0.16em] text-fg-3 uppercase mt-2 text-center">{label}</div>
      {sub && <div className="text-[10px] text-fg-2 numeric mt-0.5">{sub}</div>}
    </div>
  );
}

export function LiquidBar({
  value,
  label,
  sub,
}: {
  value: number;
  label: string;
  sub?: string;
}) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className="tcard p-4 min-w-0 flex gap-3 items-stretch">
      <div className="w-10 rounded border border-border-soft bg-app overflow-hidden relative shrink-0">
        <div
          className="absolute bottom-0 left-0 right-0 bg-profit/80 transition-all duration-700"
          style={{ height: `${pct}%` }}
        />
      </div>
      <div className="min-w-0 flex flex-col justify-center">
        <div className="text-[10px] tracking-[0.16em] text-fg-3 uppercase">{label}</div>
        <div className="font-display font-black text-2xl numeric mt-1">{Math.round(pct)}%</div>
        {sub && <div className="text-[10px] text-fg-3 mt-0.5">{sub}</div>}
      </div>
    </div>
  );
}
