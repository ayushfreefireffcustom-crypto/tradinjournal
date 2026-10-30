// Loading indicators. <Loader> is an inline ring spinner in the brand green (drop it anywhere
// data is loading); <LoadingScreen> is the full-page / route-level loader: the logo with an
// indeterminate progress sweep. Both carry `.v6` so they follow the dark/light theme.
import Logo from '@/components/logo';
import '@/styles/v6/tokens.css';
import '@/styles/v6/auth.css';

/** Inline ring spinner. `size` in px. Optional label below. */
export function Loader({ size = 28, label, className = '' }: { size?: number; label?: string; className?: string }) {
  return (
    <div className={`v6 au-spinner flex flex-col items-center gap-3 ${className}`} role="status" aria-live="polite">
      <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" style={{ animationDuration: '0.8s' }} aria-hidden>
        <circle className="au-spintrack" cx="12" cy="12" r="9" fill="none" strokeWidth="2.5" />
        <circle className="au-spinarc" cx="12" cy="12" r="9" fill="none" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 44" />
      </svg>
      {label && <span className="au-spinlbl">{label}</span>}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Full-area loading state: the logo on the page background, with a hairline progress sweep. */
export function LoadingScreen({ label = 'Loading your journal', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`v6 au-root au-load ${className}`} data-testid="loading-screen" role="status" aria-live="polite">
      <div className="au-ld">
        <Logo height={40} />
        <div className="au-ldtrack" aria-hidden><i /></div>
        <p>{label}&hellip;</p>
      </div>
    </div>
  );
}
