// Reusable loading indicators in the obsidian theme. <Loader> is a clean green
// ring spinner (drop it anywhere data is loading); <LoadingScreen> fills its
// area with the wordmark + spinner for full-page / route-level loading.

/** A minimal green ring spinner. `size` in px. Optional inline label below. */
export function Loader({ size = 28, label, className = '' }: { size?: number; label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`} role="status" aria-live="polite">
      <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" style={{ animationDuration: '0.75s' }} aria-hidden>
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-profit)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 44" />
      </svg>
      {label && <span className="text-[10px] tracking-[0.24em] uppercase text-fg-3">{label}</span>}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Full-area loading state: brand wordmark + spinner, centered on the app bg. */
export function LoadingScreen({ label = 'Loading', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`w-full h-full min-h-[60vh] flex flex-col items-center justify-center gap-6 bg-app ${className}`} data-testid="loading-screen">
      <div className="font-display font-black text-[19px] tracking-tight text-fg select-none">
        TRADE<span className="text-profit">logs</span>
      </div>
      <Loader size={30} />
      <span className="text-[10px] tracking-[0.24em] uppercase text-fg-3">{label}…</span>
    </div>
  );
}
