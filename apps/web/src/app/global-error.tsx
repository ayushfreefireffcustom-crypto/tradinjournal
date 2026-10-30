'use client';

// Shown when the root layout itself fails, so it brings its own <html> and theme.
import StatusCard, { SC_ICONS } from '@/components/v6/auth/status-card';

const THEME = `(function(){var t='dark';try{t=localStorage.getItem('tl-theme')==='light'?'light':'dark'}catch(e){}document.documentElement.dataset.theme=t})();`;

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: THEME }} /></head>
      <body style={{ margin: 0 }}>
        <StatusCard testId="global-error-page" tone="r" icon={SC_ICONS.warn} kicker="Something went wrong" title="TRADElogs couldn’t load"
          body="Your data is safe. Reload to try again.">
          <div className="au-stacts">
            <button type="button" onClick={reset} className="x-btn x-btn--hi x-btn--lg x-btn--full">Try again</button>
            <a href="/" className="x-btn x-btn--lg x-btn--full x-btn--ghost">Back to home</a>
          </div>
        </StatusCard>
      </body>
    </html>
  );
}
