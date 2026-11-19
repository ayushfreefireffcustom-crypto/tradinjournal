// Still drawings for the access screens. Colours come from the v6 tokens, so they hold in both themes.

/**
 * The trade-activity rule, drawn: the last `days` days as a small calendar, every day empty,
 * and today outlined in green with one closed trade (a green candle) waiting to go in.
 */
export function ActivityArt({ days = 30 }: { days?: number }) {
  const n = Math.max(1, Math.min(31, Math.round(days)));
  const cols = n <= 10 ? n : 10, rows = Math.ceil(n / cols);
  // Fill the card: bigger squares when there are fewer days.
  const gap = rows === 1 ? 5 : 4;
  const size = Math.min(16, Math.floor((128 - gap * (cols - 1)) / cols));
  const w = cols * size + (cols - 1) * gap, h = rows * size + (rows - 1) * gap;
  const x0 = 80 - w / 2, y0 = 48 + (38 - h) / 2;
  const cells = [];
  for (let i = 0; i < n - 1; i++) {
    const r = Math.floor(i / cols), c = i % cols;
    cells.push(<rect key={i} x={x0 + c * (size + gap)} y={y0 + r * (size + gap)} width={size} height={size} rx={size / 3.5} fill="var(--s3)" />);
  }
  const ti = n - 1, tx = x0 + (ti % cols) * (size + gap), ty = y0 + Math.floor(ti / cols) * (size + gap);
  return (
    <svg viewBox="0 0 160 116" className="au-art-svg" aria-hidden>
      <ellipse cx="80" cy="106" rx="60" ry="4" fill="var(--au-art-shadow, rgba(0, 0, 0, .3))" />
      <rect x="6" y="14" width="148" height="84" rx="13" fill="var(--s1)" stroke="var(--line-2)" />
      <rect x="18" y="27" width="30" height="7" rx="3.5" fill="var(--tx)" opacity=".8" />
      <text x="142" y="34" textAnchor="end" fontFamily="var(--sans)" fontSize="10" fontWeight="600" fill="var(--dim)">{n} days</text>
      {cells}
      {/* today: one closed trade brings access back */}
      <rect x={tx - 2} y={ty - 2} width={size + 4} height={size + 4} rx={size / 3} fill="var(--g-soft)" stroke="var(--g)" strokeWidth="1.3" strokeDasharray="3 2.2" />
      <path d={`M${tx + size / 2} ${ty + size * 0.12}v${size * 0.76}`} stroke="var(--g)" strokeWidth="1.2" strokeLinecap="round" />
      <rect x={tx + size / 2 - size * 0.17} y={ty + size * 0.28} width={size * 0.34} height={size * 0.42} rx="1" fill="var(--g)" />
    </svg>
  );
}
