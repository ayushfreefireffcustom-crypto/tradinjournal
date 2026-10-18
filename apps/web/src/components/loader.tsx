// Loading indicators. <Loader> is an inline violet ring spinner (drop it anywhere
// data is loading); <LoadingScreen> is the full-page / route-level loader:
// app mark with an orbiting arc, wordmark and an indeterminate shimmer bar.

/** Inline ring spinner. `size` in px. Optional label below. */
export function Loader({ size = 28, label, className = '' }: { size?: number; label?: string; className?: string }) {
  return (
    <div className={`flex flex-col items-center gap-3 ${className}`} role="status" aria-live="polite">
      <svg width={size} height={size} viewBox="0 0 24 24" className="animate-spin" style={{ animationDuration: '0.8s' }} aria-hidden>
        <circle cx="12" cy="12" r="9" fill="none" stroke="var(--color-border)" strokeWidth="2.5" />
        <circle cx="12" cy="12" r="9" fill="none" stroke="#6E4BFF" strokeWidth="2.5" strokeLinecap="round" strokeDasharray="14 44" />
      </svg>
      {label && <span className="text-[13px] text-fg-3">{label}</span>}
      <span className="sr-only">Loading</span>
    </div>
  );
}

/** Full-area loading state on the night background. */
export function LoadingScreen({ label = 'Loading your journal', className = '' }: { label?: string; className?: string }) {
  return (
    <div className={`tl-loading ${className}`} data-testid="loading-screen" role="status" aria-live="polite">
      <style>{`
        .tl-loading{position:relative;width:100%;height:100%;min-height:100dvh;display:grid;place-items:center;background:#0A0911;overflow:hidden;font-family:'Satoshi',ui-sans-serif,system-ui,sans-serif}
        .tl-loading:before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(196,181,255,.22) 1.1px,transparent 1.4px);background-size:22px 22px;-webkit-mask-image:radial-gradient(40% 40% at 50% 50%,#000,transparent 75%);mask-image:radial-gradient(40% 40% at 50% 50%,#000,transparent 75%)}
        .tl-loading:after{content:"";position:absolute;left:50%;top:50%;width:700px;max-width:120vw;height:360px;transform:translate(-50%,-50%);background:radial-gradient(closest-side,rgba(110,75,255,.30),transparent);filter:blur(30px)}
        .tl-ld{position:relative;z-index:1;display:flex;flex-direction:column;align-items:center}
        .tl-mark{position:relative;width:76px;height:76px;border-radius:22px;background:linear-gradient(145deg,#1A1826,#100F17);border:1px solid #2A2932;display:grid;place-items:center;box-shadow:0 30px 60px -20px rgba(110,75,255,.6)}
        .tl-mark:before{content:"";position:absolute;inset:-7px;border-radius:28px;border:1.5px solid transparent;border-top-color:#9479FF;border-right-color:rgba(148,121,255,.35);animation:tl-orbit 1.4s cubic-bezier(.6,.2,.4,.8) infinite}
        .tl-line{stroke-dasharray:48;stroke-dashoffset:48;animation:tl-draw 1.6s cubic-bezier(.22,1,.36,1) infinite}
        .tl-wm{margin-top:26px;font-weight:700;font-size:26px;letter-spacing:-.035em;color:#fff}
        .tl-wm span{color:#9479FF}
        .tl-track{margin-top:22px;width:220px;height:3px;border-radius:3px;background:#2A2932;overflow:hidden;position:relative}
        .tl-track i{position:absolute;top:0;bottom:0;width:45%;border-radius:3px;background:linear-gradient(90deg,transparent,#9479FF 30%,#fff 60%,#9479FF 80%,transparent);animation:tl-sweep 1.3s cubic-bezier(.4,0,.2,1) infinite}
        .tl-ld p{margin-top:16px;font-size:14px;color:#8A8A90}
        @keyframes tl-orbit{to{transform:rotate(360deg)}}
        @keyframes tl-draw{0%{stroke-dashoffset:48}55%,100%{stroke-dashoffset:0}}
        @keyframes tl-sweep{from{left:-45%}to{left:100%}}
        @media (prefers-reduced-motion:reduce){.tl-mark:before,.tl-track i,.tl-line{animation:none}.tl-line{stroke-dashoffset:0}.tl-track i{left:28%}}
      `}</style>
      <div className="tl-ld">
        <div className="tl-mark" aria-hidden>
          <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
            <path className="tl-line" d="M6 30 L13 22 L19 26 L27 14 L34 9" stroke="#9479FF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="34" cy="9" r="3.2" fill="#fff" />
          </svg>
        </div>
        <div className="tl-wm">TRADE<span>logs</span></div>
        <div className="tl-track" aria-hidden><i /></div>
        <p>{label}&hellip;</p>
      </div>
    </div>
  );
}
