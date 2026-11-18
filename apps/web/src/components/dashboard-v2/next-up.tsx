'use client';

// "Next up": one card that says what to do now (see lib/dashboard-next.ts for how it's picked).
import Link from 'next/link';
import { ArrowRight, ChatCircleText, Notebook } from '@phosphor-icons/react';
import { brokeLine, type NextUp } from '@/lib/dashboard-next';
import { kmoney } from '@/lib/dashboard-v2-format';
import { ReviewArt } from './art';

export default function NextUpCard({ n, onLater, onStart, onAsk }: { n: NextUp; onLater: () => void; onStart: () => void; onAsk: () => void }) {
  const review = n.kind === 'review';
  return (
    <section className={`d2-next${review ? ' has-art' : ''}`} aria-label="Next up" data-testid="next-up">
      <span className="d2-glyph" aria-hidden>{review ? <Notebook size={26} /> : <ChatCircleText size={26} />}</span>
      <div className="d2-next-t">
        <div className="d2-kick">{review ? 'Next up' : 'Your biggest leak'}</div>
        {review ? (
          <>
            <h2>Review {n.day} {n.partial ? 'trades' : n.count === 1 ? 'trade' : `${n.count} trades`}</h2>
            <p>
              <span>{brokeLine(n)}</span>
              {n.reasons.map(r => <span key={r} className="d2-chip dn">{r}</span>)}
              <span className="d2-nw">· about {n.minutes} minutes</span>
            </p>
          </>
        ) : (
          <>
            <h2>{n.label} cost you <span className="d2-n dn">{kmoney(n.net, { plus: false })}</span></h2>
            <p><span>{[`${n.trades} trades`, n.sub.replace(/^\d+(\s+trades)?\s*(·\s*)?/, '')].filter(Boolean).join(' · ')}</span><span className="d2-nw">· ask the coach how to cut it</span></p>
          </>
        )}
      </div>
      <div className="d2-next-a">
        <button type="button" className="x-btn x-btn--ghost" onClick={onLater} data-testid="next-later">Later</button>
        {review
          ? <Link href={n.href} className="x-btn x-btn--hi" onClick={onStart} data-testid="next-start">Start review<ArrowRight size={15} /></Link>
          : <button type="button" className="x-btn x-btn--hi" onClick={onAsk} data-testid="next-ask">Ask the coach<ArrowRight size={15} /></button>}
      </div>
      {review && <div className="d2-next-art"><ReviewArt flagged={n.flagged} /></div>}
    </section>
  );
}
