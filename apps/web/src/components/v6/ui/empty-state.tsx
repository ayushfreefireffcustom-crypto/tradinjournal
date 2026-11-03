'use client';

// Empty states for the markets and strategy pages (styles/v6/lux.css, `lx-empty`):
// a faint preview of what will fill the space, an icon tile (Phosphor, duotone), a title, one line
// of why, and the next step as buttons. `compact` is for panels and side rails.
import type { ReactNode } from 'react';
import {
  ArrowsClockwise, ArrowsLeftRight, Bell, CalendarBlank, ChartBar, ChartLine, Globe, Lock, MagnifyingGlass, Newspaper, Note,
  Play, Plug, Pulse, ShieldCheck, Star, TrendUp, type Icon,
} from '@phosphor-icons/react';

export type EmptyIcon = 'search' | 'signal' | 'pulse' | 'compare' | 'bell' | 'globe' | 'play' | 'run' | 'report' | 'news' | 'calendar' | 'star' | 'chart' | 'plug' | 'lock' | 'note' | 'shield';
export type EmptyGhost = 'table' | 'cards' | 'chart' | 'list' | 'news' | 'calendar' | 'bars';

const ICONS: Record<EmptyIcon, Icon> = {
  search: MagnifyingGlass, signal: TrendUp, pulse: Pulse, compare: ArrowsLeftRight, bell: Bell, globe: Globe, play: Play,
  run: ArrowsClockwise, report: ChartBar, news: Newspaper, calendar: CalendarBlank, star: Star, chart: ChartLine,
  plug: Plug, lock: Lock, note: Note, shield: ShieldCheck,
};

/** Faint shapes of the content that will appear here; decorative only. */
function Ghost({ kind }: { kind: EmptyGhost }) {
  const rows = [0, 1, 2, 3];
  const svg = (children: ReactNode) => <svg className="lx-ghost" viewBox="0 0 480 160" preserveAspectRatio="xMidYMid meet" aria-hidden>{children}</svg>;
  switch (kind) {
    case 'table': return svg(rows.map(i => <g key={i} transform={`translate(0 ${18 + i * 36})`}><circle cx="24" cy="10" r="9" /><rect x="42" y="5" width={80 + (i % 2) * 30} height="10" rx="5" /><rect x="230" y="5" width="56" height="10" rx="5" /><rect x={320 + (i % 3) * 6} y="3" width="64" height="14" rx="7" /><rect x="410" y="5" width="50" height="10" rx="5" /></g>));
    case 'cards': return svg([0, 1, 2].map(i => <g key={i} transform={`translate(${12 + i * 158} 14)`}><rect width="142" height="132" rx="14" className="lx-ghost-o" /><circle cx="22" cy="24" r="10" /><rect x="14" y="48" width="96" height="12" rx="6" /><rect x="14" y="70" width="60" height="8" rx="4" /><rect x="14" y="96" width="114" height="22" rx="8" /></g>));
    case 'chart': return svg(<><path d="M0 128 L40 112 L80 120 L120 92 L160 100 L200 70 L240 82 L280 54 L320 66 L360 40 L400 52 L440 28 L480 36 L480 160 L0 160Z" /><path d="M0 128 L40 112 L80 120 L120 92 L160 100 L200 70 L240 82 L280 54 L320 66 L360 40 L400 52 L440 28 L480 36" className="lx-ghost-l" /></>);
    case 'bars': return svg([38, 70, 52, 96, 64, 110, 84, 58, 102, 74, 120, 90].map((h, i) => <rect key={i} x={14 + i * 39} y={150 - h} width="24" height={h} rx="5" />));
    case 'news': return svg([0, 1, 2].map(i => <g key={i} transform={`translate(16 ${14 + i * 48})`}><rect width="56" height="38" rx="8" /><rect x="72" y="4" width={250 - i * 40} height="10" rx="5" /><rect x="72" y="22" width={170 + i * 30} height="8" rx="4" /><rect x="380" y="6" width="68" height="14" rx="7" /></g>));
    case 'calendar': return svg(rows.map(i => <g key={i} transform={`translate(16 ${16 + i * 36})`}><rect width="44" height="10" rx="5" y="4" /><circle cx="78" cy="9" r="5" /><rect x="96" y="3" width={190 - (i % 2) * 50} height="12" rx="6" /><rect x="360" y="3" width="40" height="12" rx="6" /><rect x="408" y="3" width="40" height="12" rx="6" /></g>));
    default: return svg(rows.map(i => <g key={i} transform={`translate(16 ${18 + i * 34})`}><rect width="10" height="10" rx="3" y="2" /><rect x="22" y="2" width={300 - i * 40} height="10" rx="5" /><rect x="380" y="2" width="70" height="10" rx="5" /></g>));
  }
}

export default function EmptyState({ icon, ghost, title, children, actions, hints, compact, tone, testId, className }: {
  icon: EmptyIcon; ghost?: EmptyGhost; title: ReactNode; children?: ReactNode; actions?: ReactNode;
  /** Short examples or steps, shown as chips under the text. */
  hints?: ReactNode[];
  compact?: boolean; tone?: 'warn'; testId?: string; className?: string;
}) {
  return (
    <div className={`lx-empty ${compact ? 'lx-empty--compact' : ''} ${tone === 'warn' ? 'lx-empty--warn' : ''} ${className ?? ''}`} data-testid={testId}>
      {ghost && !compact && <Ghost kind={ghost} />}
      <div className="lx-empty-in">
        <span className="lx-empty-ic" aria-hidden>{(() => { const I = ICONS[icon]; return <I size={compact ? 20 : 26} weight="duotone" />; })()}</span>
        <b className="lx-empty-t">{title}</b>
        {children && <p className="lx-empty-p">{children}</p>}
        {hints && hints.length > 0 && <div className="lx-empty-hints">{hints.map((h, i) => <span key={i}>{h}</span>)}</div>}
        {actions && <div className="lx-empty-a">{actions}</div>}
      </div>
    </div>
  );
}
