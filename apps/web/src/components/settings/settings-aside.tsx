// Right-hand companion column for the Settings page (wide screens). Fills the
// horizontal space with useful, illustrated panels rather than leaving a void:
// how each alert channel reaches you, and an on-brand decorative summary.
import { DeviceMobile, EnvelopeSimple, CalendarCheck, ShieldCheck, type Icon } from '@phosphor-icons/react';

const CHANNELS: { icon: Icon; title: string; cadence: string; desc: string }[] = [
  { icon: DeviceMobile, title: 'Real-time push', cadence: 'Instant', desc: 'The moment a high-impact event or market-moving news is about to hit.' },
  { icon: EnvelopeSimple, title: 'Email digest', cadence: 'Daily', desc: 'One morning email compiling everything on your radar for the day.' },
  { icon: CalendarCheck, title: 'Weekly review', cadence: 'Saturday', desc: 'A coach-written recap of what worked and what leaked, from your own trades.' },
];

export default function SettingsAside() {
  return (
    <div className="flex flex-col gap-4 lg:sticky lg:top-4" data-testid="settings-aside">
      {/* How alerts reach you */}
      <div className="tcard p-5">
        <div className="text-[10px] tracking-[0.2em] uppercase text-fg-3 mb-4">How alerts reach you</div>
        <div className="space-y-3">
          {CHANNELS.map(c => {
            const I = c.icon;
            return (
              <div key={c.title} className="flex gap-3 rounded-[var(--radius-card)] border border-border-soft bg-surface/40 p-3">
                <span className="shrink-0 h-9 w-9 rounded-lg bg-profit/12 ring-1 ring-profit/20 flex items-center justify-center">
                  <I size={16} weight="fill" className="text-profit" />
                </span>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-fg">{c.title}</span>
                    <span className="px-1.5 py-0.5 rounded text-[8px] tracking-[0.14em] uppercase bg-surface-active text-fg-3">{c.cadence}</span>
                  </div>
                  <p className="text-[11.5px] text-fg-3 leading-relaxed mt-1">{c.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Decorative brand panel */}
      <div className="tcard relative overflow-hidden p-5 min-h-[168px] flex flex-col justify-end">
        <svg viewBox="0 0 400 200" preserveAspectRatio="none" className="absolute inset-0 w-full h-full opacity-80" aria-hidden>
          <defs>
            <linearGradient id="sa-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#08C465" stopOpacity="0.18" />
              <stop offset="100%" stopColor="#08C465" stopOpacity="0" />
            </linearGradient>
            <pattern id="sa-dots" width="20" height="20" patternUnits="userSpaceOnUse">
              <circle cx="1.5" cy="1.5" r="1.1" fill="rgba(255,255,255,0.045)" />
            </pattern>
          </defs>
          <rect width="400" height="200" fill="url(#sa-dots)" />
          <path d="M0,150 L50,142 L100,150 L150,120 L200,128 L250,92 L300,100 L350,64 L400,50 L400,200 L0,200 Z" fill="url(#sa-fill)" />
          <path d="M0,150 L50,142 L100,150 L150,120 L200,128 L250,92 L300,100 L350,64 L400,50" fill="none" stroke="#08C465" strokeWidth="2" strokeOpacity="0.5" strokeLinejoin="round" />
        </svg>
        <div className="relative">
          <div className="flex items-center gap-1.5 text-[9px] tracking-[0.22em] uppercase text-profit mb-2">
            <ShieldCheck size={12} weight="fill" /> Private &amp; read-only
          </div>
          <div className="font-display font-black text-[16px] leading-tight tracking-tight text-fg">
            Understand your trading.<br />Improve every day.
          </div>
          <p className="text-[11.5px] text-fg-3 leading-relaxed mt-2">
            TRADElogs only ever reads your MT5 history — it never places trades or touches your funds.
          </p>
        </div>
      </div>
    </div>
  );
}
