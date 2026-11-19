'use client';

// Empty states across the app (styles/v6/lux.css, `lx-empty`): a still drawing of what will
// fill the space, in a round disc, centred over a title, one line of why, and the next step as
// buttons. `compact` is for panels and side rails: a small icon tile instead of the drawing.
import type { ReactNode } from 'react';
import { SceneDisc, type SceneKind } from './scene-art';
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

const SCENE: Record<EmptyIcon, SceneKind> = {
  search: 'search', signal: 'signal', pulse: 'pulse', compare: 'compare', bell: 'bell', globe: 'news', play: 'play', run: 'play',
  report: 'report', news: 'news', calendar: 'calendar', star: 'star', chart: 'signal', plug: 'plug', lock: 'lock', note: 'note', shield: 'shield',
};

export default function EmptyState({ icon, art, title, children, actions, hints, compact, tone, testId, className, drawn }: {
  icon: EmptyIcon; title: ReactNode; children?: ReactNode; actions?: ReactNode;
  /** @deprecated kept for callers; the drawing replaced the faint preview. */
  ghost?: EmptyGhost;
  /** The drawing to show; defaults to the one that goes with `icon`. */
  art?: SceneKind;
  /** Short examples or steps, shown as chips under the text. */
  hints?: ReactNode[];
  compact?: boolean; tone?: 'warn'; testId?: string; className?: string;
  /** Compact, but with a small drawing instead of the icon tile (panels with room to spare). */
  drawn?: boolean;
}) {
  return (
    <div className={`lx-empty ${compact ? 'lx-empty--compact' : ''} ${tone === 'warn' ? 'lx-empty--warn' : ''} ${className ?? ''}`} data-testid={testId}>
      <div className="lx-empty-in">
        {compact && drawn ? <SceneDisc kind={art ?? SCENE[icon]} size="xs" />
          : compact
          ? <span className="lx-empty-ic" aria-hidden>{(() => { const I = ICONS[icon]; return <I size={20} weight="duotone" />; })()}</span>
          : <SceneDisc kind={art ?? SCENE[icon]} />}
        <b className="lx-empty-t">{title}</b>
        {children && <p className="lx-empty-p">{children}</p>}
        {hints && hints.length > 0 && <div className="lx-empty-hints">{hints.map((h, i) => <span key={i}>{h}</span>)}</div>}
        {actions && <div className="lx-empty-a">{actions}</div>}
      </div>
    </div>
  );
}
