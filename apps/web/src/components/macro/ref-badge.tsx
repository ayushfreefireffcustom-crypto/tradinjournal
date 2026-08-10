/** Badge for delayed / proxy / official-reference quotes (IITian-style honesty). */
export default function RefBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center text-[8px] tracking-[0.14em] uppercase px-1 py-0.5 rounded border border-border-soft text-fg-3 ${className}`}
      title="Reference / delayed or ETF proxy — not a tick feed"
      data-testid="ref-badge"
    >
      REF
    </span>
  );
}
