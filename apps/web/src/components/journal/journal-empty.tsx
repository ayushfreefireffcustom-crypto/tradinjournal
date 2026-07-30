// Illustrative empty state for the Journal — a single clean "example entry"
// preview (so you see exactly what you're about to create) plus guidance.
// Centered and appropriately sized so the column never looks half-empty.
import { NotePencil, ArrowLeft } from '@phosphor-icons/react';

export default function JournalEmpty() {
  return (
    <div className="tcard flex flex-col items-center justify-center text-center px-5 sm:px-8 py-10 sm:py-14 min-h-[440px]" data-testid="notebook-empty">
      {/* A single, tasteful sample entry — shows the shape of a journal note. */}
      <div className="relative w-full max-w-[360px] rounded-[var(--radius-card)] border border-dashed border-border-strong bg-surface/30 p-4 text-left mb-8">
        <span className="absolute -top-2 left-4 px-1.5 py-0.5 text-[8px] tracking-[0.18em] bg-app text-fg-3 border border-border-soft rounded">EXAMPLE</span>
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-[9px] tracking-[0.16em] text-fg-3 numeric">12 JUL · LONDON</span>
          <span className="px-1.5 py-0.5 text-[8px] tracking-[0.16em] border border-profit/50 text-profit rounded">DISCIPLINED</span>
        </div>
        <div className="text-[13px] font-semibold text-fg/80 mb-1.5">Waited for the London open</div>
        <p className="text-[11px] text-fg-3 leading-relaxed">Held back until the range broke with volume. No revenge trades after the first stop — followed the plan and let it run to target.</p>
      </div>

      <span className="inline-flex h-11 w-11 items-center justify-center rounded-full bg-profit/12 ring-1 ring-profit/25 mb-4">
        <NotePencil size={20} weight="fill" className="text-profit" />
      </span>
      <h3 className="font-display font-bold text-[18px] tracking-tight">Your trading logbook is empty</h3>
      <p className="text-fg-2 text-[13px] leading-relaxed mt-2 max-w-md">
        Capture the <span className="text-fg">why</span> behind each trade — your rationale, the emotion you felt, and the lesson. Patterns emerge fast once you start writing.
      </p>

      <div className="flex flex-wrap gap-2 mt-5 justify-center">
        {['Trade rationale', 'Emotions', 'Lessons learned', 'Weekly review'].map(t => (
          <span key={t} className="px-2.5 py-1 rounded-full border border-border-soft text-[10px] tracking-wide text-fg-3">{t}</span>
        ))}
      </div>

      <span className="flex items-center gap-1.5 text-[11px] text-profit mt-6">
        <ArrowLeft size={13} weight="bold" className="hidden lg:inline" />
        <span className="lg:hidden">Write your first note below</span>
        <span className="hidden lg:inline">Write your first note on the left</span>
      </span>
    </div>
  );
}
