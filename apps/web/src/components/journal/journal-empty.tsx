// Illustrative empty state for the Journal — instead of a bare icon, it shows a
// faded stack of sample entries (what you're about to create) plus guidance, so
// the page reads intentional and inviting rather than blank.
import { NotePencil, ArrowLeft } from '@phosphor-icons/react';

// A faded, non-interactive preview of a journal entry.
function GhostEntry({ accent, emotion, lines, className = '' }: { accent: string; emotion: string; lines: number[]; className?: string }) {
  return (
    <div className={`rounded-[var(--radius-card)] border border-border-soft bg-surface/40 p-4 ${className}`}>
      <div className="flex items-center justify-between mb-2.5">
        <div className="flex items-center gap-2 text-[9px] tracking-widest text-fg-3/70">
          <span className="numeric">12 JUL</span>
          <span className={accent}>· {emotion}</span>
        </div>
        <span className={`px-2 py-0.5 text-[8px] tracking-widest border rounded ${accent} border-current/40`}>{emotion}</span>
      </div>
      <div className="h-2.5 w-1/2 rounded bg-fg/10 mb-2.5" />
      <div className="space-y-1.5">
        {lines.map((w, i) => <div key={i} className="h-1.5 rounded bg-fg/[0.06]" style={{ width: `${w}%` }} />)}
      </div>
    </div>
  );
}

export default function JournalEmpty() {
  return (
    <div className="tcard p-8 sm:p-10 flex flex-col items-center text-center" data-testid="notebook-empty">
      {/* Illustrative stack of sample entries */}
      <div className="relative w-full max-w-[320px] h-[168px] mb-7" aria-hidden>
        <div className="absolute inset-x-6 top-6 opacity-40 scale-[0.96]"><GhostEntry accent="text-loss" emotion="TILTED" lines={[100, 82, 60]} /></div>
        <div className="absolute inset-x-3 top-3 opacity-70 scale-[0.98]"><GhostEntry accent="text-warning" emotion="ANXIOUS" lines={[100, 74]} /></div>
        <div className="absolute inset-x-0 top-0"><GhostEntry accent="text-profit" emotion="DISCIPLINED" lines={[100, 88, 66]} /></div>
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

      <div className="flex items-center gap-1.5 text-[11px] text-profit mt-6 lg:hidden">
        Write your first note below
      </div>
      <div className="hidden lg:flex items-center gap-1.5 text-[11px] text-profit mt-6">
        <ArrowLeft size={13} weight="bold" /> Write your first note on the left
      </div>
    </div>
  );
}
