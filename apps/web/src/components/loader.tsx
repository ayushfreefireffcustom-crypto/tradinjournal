// Loading indicators. <Loader> is an inline ring spinner in the accent colour (drop it anywhere
// data is loading); <LoadingScreen> is the full-page / route-level loader:
// the logo with an indeterminate progress sweep.
import Logo from '@/components/logo';

/** Inline ring spinner. `size` in px. Optional label below. */
export function Loader({ size = 28, label, className = '' }: { size?: number; label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`} role="status" aria-live="polite">
      <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" style={{ animationDuration: '0.8s' }} aria-hidden>
        <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".14" strokeWidth="2.5" />
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--acc, #08C465)" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 44" />
      </svg>
      {label && <span className="text-[13px] text-fg-3">{label}</span>}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Full-area loading state: the logo over black, with a hairline progress sweep. */
export function LoadingScreen({ label = 'Loading your journal', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`tl-loading ${className}`} data-testid="loading-screen" role="status" aria-live="polite">
      <style>{`
        .tl-loading{position:relative;width:100%;height:100%;min-height:100dvh;display:grid;place-items:center;background:#050505;overflow:hidden;font-family:inherit}
        .tl-loading:after{content:"";position:absolute;left:50%;top:50%;width:720px;max-width:140vw;height:420px;transform:translate(-50%,-50%);background:radial-gradient(50% 50% at 50% 50%,rgba(8,196,101,.06),rgba(8,196,101,.02) 45%,transparent 72%);pointer-events:none}
        .tl-ld{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center;animation:tl-in .5s cubic-bezier(.22,1,.36,1) both}
        .tl-track{margin-top:30px;width:160px;height:2px;border-radius:2px;background:rgba(255,255,255,.08);overflow:hidden;position:relative}
        .tl-track i{position:absolute;top:0;bottom:0;width:40%;border-radius:2px;background:linear-gradient(90deg,transparent,#08C465 40%,#7DF2B6 60%,transparent);animation:tl-sweep 1.2s cubic-bezier(.4,0,.2,1) infinite}
        .tl-ld p{margin-top:14px;font-size:13px;color:#6E6E76;letter-spacing:.01em}
        @keyframes tl-in{from{opacity:0;transform:translateY(6px)}}
        @keyframes tl-sweep{from{left:-40%}to{left:100%}}
        @media (prefers-reduced-motion:reduce){.tl-ld,.tl-track i{animation:none}.tl-track i{left:30%}}
      `}</style>
      <div className="tl-ld">
        <Logo height={44} />
        <div className="tl-track" aria-hidden><i /></div>
        <p>{label}&hellip;</p>
      </div>
    </div>
  );
}
