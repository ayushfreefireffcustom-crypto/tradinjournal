'use client';

// Guided product tour (H9): a short card the first time you open each main
// page, with a way to the next stop. Skippable for good; progress is saved
// to the account so it doesn't repeat on another device.
import Link from '@/components/v6/ui/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { accountApi, type TourState } from '@/lib/account-api';
import { TRADING_ENABLED } from '@/lib/features';

interface Stop { id: string; path: string; title: string; body: string }
export const TOUR: Stop[] = [
  { id: 'dashboard', path: '/dashboard', title: 'Your dashboard', body: 'Your P&L, the numbers that matter and this month at a glance. It fills in once your MT5 account has synced.' },
  { id: 'analytics', path: '/analytics', title: 'Analytics', body: 'Win rate, profit factor, drawdown and breakdowns by market, day and hour, all from your broker’s own records.' },
  { id: 'coach', path: '/coach', title: 'The AI coach', body: 'Ask about your trading. It reads your trades and journal, and can be handed your exchange positions or strategies with the chips above the message box.' },
  { id: 'builder', path: '/strategies', title: 'Strategies', body: 'Turn an idea into rules, backtest them honestly, then run them on paper before risking money.' },
  ...(TRADING_ENABLED ? [{ id: 'leaders', path: '/copy', title: 'Copy trading', body: 'Follow verified leaders; their trades are copied to your exchange account with the limits you set. Try it on testnet first.' }] : []),
];

let cache: TourState | null = null;

export default function Tour() {
  const path = usePathname();
  const [state, setState] = useState<TourState | null>(cache);
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    if (cache) return;
    accountApi.tour().then((t) => { cache = t; setState(t); }, () => undefined);
  }, []);
  useEffect(() => { setHidden(false); }, [path]);
  if (!state || state.dismissed || hidden) return null;
  const i = TOUR.findIndex((s) => s.path === path);
  const stop = TOUR[i];
  if (!stop || state.seen.includes(stop.id)) return null;
  const next = TOUR.slice(i + 1).find((s) => !state.seen.includes(s.id));
  const save = (patch: { seen?: string[]; dismissed?: boolean }) => {
    const local: TourState = { seen: [...new Set([...state.seen, ...(patch.seen ?? [])])], dismissed: patch.dismissed ?? state.dismissed };
    cache = local; setState(local);
    accountApi.updateTour(patch).then((t) => { cache = t; }, () => undefined);
  };
  return (
    <div className="v6 tour-host">
    <aside className="tour" role="dialog" aria-label={`Tour: ${stop.title}`} data-testid="tour">
      <span className="tour-step">Tour · {i + 1} of {TOUR.length}</span>
      <b>{stop.title}</b>
      <p>{stop.body}</p>
      <div className="tour-act">
        <button type="button" className="tour-skip" onClick={() => save({ dismissed: true })} data-testid="tour-skip">Skip the tour</button>
        <button type="button" className="x-btn x-btn--sm" onClick={() => { save({ seen: [stop.id] }); setHidden(true); }} data-testid="tour-ok">Got it</button>
        {next && <Link className="x-btn x-btn--sm x-btn--hi" href={next.path} onClick={() => save({ seen: [stop.id] })} data-testid="tour-next">Next: {next.title}</Link>}
      </div>
    </aside>
    </div>
  );
}

/** Forget progress so the tour starts again (Settings). */
export async function restartTour() {
  cache = await accountApi.updateTour({ reset: true });
}
