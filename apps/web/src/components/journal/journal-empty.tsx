// Detailed, thoughtful empty state for the Journal. Instead of one lonely card,
// it teaches: a short pitch, two real example entries (a disciplined win + an
// FOMO mistake) so you see the shape of a good note, and starter prompts. Fills
// the column and doubles as onboarding.
import { NotePencil, ArrowLeft, Target, Warning, Lightbulb } from '@phosphor-icons/react';

type Sample = { date: string; emotion: string; negative: boolean; title: string; body: string };

const SAMPLES: Sample[] = [
  {
    date: '12 JUL · LONDON',
    emotion: 'DISCIPLINED',
    negative: false,
    title: 'Waited for the London open',
    body: 'Held back until the range broke with volume. No revenge trades after the first stop — followed the plan and let it run to target.',
  },
  {
    date: '09 JUL · NEW YORK',
    emotion: 'FOMO',
    negative: true,
    title: 'Chased XAUUSD after the spike',
    body: 'Jumped in 3 candles late with no stop plan. Gave back the morning’s gains. Lesson: if I missed the entry, I missed the trade.',
  },
];

const PROMPTS: { icon: typeof Target; text: string }[] = [
  { icon: Target, text: 'What was my plan before entering?' },
  { icon: Warning, text: 'What emotion drove the exit?' },
  { icon: Lightbulb, text: 'What will I do differently next time?' },
];

function SampleCard({ s }: { s: Sample }) {
  const accent = s.negative ? 'text-loss' : 'text-profit';
  return (
    <div className={`rounded-[var(--radius-card)] border border-border-soft bg-surface/40 border-l-2 ${s.negative ? 'border-l-loss/50' : 'border-l-profit/50'} p-3.5 text-left`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-[9px] tracking-[0.16em] text-fg-3 numeric">{s.date}</span>
        <span className={`px-1.5 py-0.5 rounded-full text-[8px] tracking-[0.14em] border border-current/40 flex items-center gap-1 ${accent}`}>
          <span className="w-1 h-1 rounded-full bg-current" /> {s.emotion}
        </span>
      </div>
      <div className="text-[13px] font-semibold text-fg/85 mb-1">{s.title}</div>
      <p className="text-[11px] text-fg-3 leading-relaxed">{s.body}</p>
    </div>
  );
}

export default function JournalEmpty() {
  return (
    <div className="tcard px-5 sm:px-8 py-8 sm:py-10" data-testid="notebook-empty">
      {/* Pitch */}
      <div className="flex flex-col items-center text-center max-w-md mx-auto">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-profit/12 ring-1 ring-profit/25 mb-4">
          <NotePencil size={22} weight="fill" className="text-profit" />
        </span>
        <h3 className="font-display font-bold text-[19px] tracking-tight">Your trading logbook is empty</h3>
        <p className="text-fg-2 text-[13px] leading-relaxed mt-2">
          The best traders review, not just trade. Capture the <span className="text-fg">why</span> behind each decision —
          your rationale, the emotion you felt, and the lesson. Patterns emerge fast once you write.
        </p>
      </div>

      {/* Example entries */}
      <div className="mt-8 max-w-2xl mx-auto">
        <div className="text-[9px] tracking-[0.22em] uppercase text-fg-3 mb-3 text-center">What a good entry looks like</div>
        <div className="grid sm:grid-cols-2 gap-3">
          {SAMPLES.map(s => <SampleCard key={s.title} s={s} />)}
        </div>
      </div>

      {/* Starter prompts */}
      <div className="mt-7 max-w-2xl mx-auto">
        <div className="text-[9px] tracking-[0.22em] uppercase text-fg-3 mb-3 text-center">Prompts to get you started</div>
        <div className="grid sm:grid-cols-3 gap-2.5">
          {PROMPTS.map(p => {
            const I = p.icon;
            return (
              <div key={p.text} className="rounded-[var(--radius-card)] border border-border-soft bg-surface/30 p-3 flex items-start gap-2.5">
                <span className="shrink-0 h-7 w-7 rounded-lg bg-profit/10 flex items-center justify-center">
                  <I size={13} weight="bold" className="text-profit" />
                </span>
                <span className="text-[11.5px] text-fg-2 leading-snug">{p.text}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* CTA */}
      <div className="flex items-center justify-center gap-1.5 text-[11px] text-profit mt-8">
        <ArrowLeft size={13} weight="bold" className="hidden lg:inline" />
        <span className="lg:hidden">Write your first note below</span>
        <span className="hidden lg:inline">Write your first note on the left</span>
      </div>
    </div>
  );
}
