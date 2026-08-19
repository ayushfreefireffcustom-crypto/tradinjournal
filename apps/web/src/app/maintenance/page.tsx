import type { Metadata } from 'next';

// Static maintenance page — NO data fetching, NO auth, NO database. Shown for
// every route by middleware.ts while MAINTENANCE_MODE is on, so the site stays
// up and on-brand even when the API/DB is unavailable.
export const metadata: Metadata = {
  title: 'TRADElogs // Under Maintenance',
  description: 'TRADElogs is undergoing scheduled maintenance and will be back shortly.',
};

export default function MaintenancePage() {
  return (
    <main className="relative min-h-screen flex items-center justify-center overflow-hidden bg-app px-6 py-16">
      {/* Ambient glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-60"
        style={{
          background:
            'radial-gradient(600px circle at 50% 30%, color-mix(in oklab, var(--color-profit, #22c55e) 12%, transparent), transparent 70%)',
        }}
      />

      <div className="relative z-10 w-full max-w-lg text-center">
        {/* Wordmark */}
        <div className="mb-8 inline-flex items-baseline gap-0.5 font-display font-black tracking-tight text-2xl">
          <span className="text-fg">TRADE</span>
          <span className="text-profit">logs</span>
        </div>

        {/* Gear badge */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full border border-border-soft bg-surface/60">
          <svg
            width="34"
            height="34"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-profit motion-safe:animate-spin"
            style={{ animationDuration: '6s' }}
            aria-hidden
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </div>

        <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tight text-fg">
          Under Maintenance
        </h1>

        <p className="mt-4 text-[15px] leading-relaxed text-fg-2">
          We&rsquo;re making some quick upgrades to keep everything running smoothly.
          TRADElogs will be back online shortly — thanks for your patience.
        </p>

        {/* Status pill */}
        <div className="mt-8 inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface/60 px-4 py-2">
          <span className="relative flex h-2 w-2">
            <span className="motion-safe:animate-ping absolute inline-flex h-full w-full rounded-full bg-profit opacity-70" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-profit" />
          </span>
          <span className="text-[11px] tracking-[0.16em] uppercase text-fg-3">
            Working on it — back soon
          </span>
        </div>

        <p className="mt-10 text-[11px] text-fg-3">
          © {new Date().getFullYear()} TRADElogs · Tactical Trade Journal
        </p>
      </div>
    </main>
  );
}
