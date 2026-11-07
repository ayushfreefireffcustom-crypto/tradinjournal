'use client';

// Drawn pieces for the trader's Partner access page.
//  - CodeTicket: the partner code as a ticket next to a padlock. It mirrors what the
//    trader types, and the padlock opens when the code belongs to a real partner.
//  - Journey: the four steps to a partner's tools as stations on a path that fills
//    in green as each one is done.
// Colours come from the v6 tokens, so both themes work; motion stops under
// prefers-reduced-motion (access.css).
import type { CSSProperties, ReactNode } from 'react';
import { Check, Handshake } from '@phosphor-icons/react';

export type TicketState = 'idle' | 'typing' | 'checking' | 'found' | 'missing' | 'linked';

export function CodeTicket({ code, state, partner }: { code: string; state: TicketState; partner?: string | null }) {
  const open = state === 'found' || state === 'linked';
  const shown = code || 'CODE';
  const size = shown.length > 12 ? 'sm' : shown.length > 8 ? 'md' : 'lg';
  const line = state === 'linked' ? `Linked to ${partner ?? 'your partner'}`
    : state === 'found' ? `${partner ?? 'Partner'} · ready to link`
    : state === 'checking' ? 'Checking the code…'
    : state === 'missing' ? 'No active partner uses this code'
    : state === 'typing' ? 'Keep typing…'
    : 'Type your partner’s code';
  return (
    <div className={`ax-ticket is-${state}`} aria-hidden data-testid="access-ticket">
      <svg viewBox="0 0 400 230" className="ax-ticket-svg">
        <defs>
          <pattern id="ax-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" className="ax-dot" /></pattern>
          <radialGradient id="ax-fade" cx="50%" cy="50%" r="60%"><stop offset="0" stopColor="#fff" stopOpacity="1" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></radialGradient>
          <mask id="ax-fade-m"><rect width="400" height="230" fill="url(#ax-fade)" /></mask>
          <radialGradient id="ax-glow" cx="50%" cy="50%" r="50%"><stop offset="0" className="ax-glow-in" /><stop offset="1" className="ax-glow-out" /></radialGradient>
          <linearGradient id="ax-sheen" x1="0" x2="1"><stop offset="0" stopColor="#fff" stopOpacity="0" /><stop offset=".5" stopColor="#fff" stopOpacity=".09" /><stop offset="1" stopColor="#fff" stopOpacity="0" /></linearGradient>
          <clipPath id="ax-tkt-clip"><path d={TICKET} /></clipPath>
        </defs>
        <rect width="400" height="230" fill="url(#ax-dots)" mask="url(#ax-fade-m)" />
        <circle cx="350" cy="128" r="92" fill="url(#ax-glow)" className="ax-glow" />
        <g className="ax-float">
          <path d={TICKET} className="ax-tkt" />
          <g clipPath="url(#ax-tkt-clip)"><g className="ax-sheen"><rect x="-120" y="30" width="110" height="170" fill="url(#ax-sheen)" transform="skewX(-18)" /></g></g>
          <line x1="100" y1="56" x2="100" y2="174" className="ax-perf" />
          <rect x="118" y="148" width="150" height="3" rx="1.5" className="ax-bar" />
          <rect x="118" y="148" width="150" height="3" rx="1.5" className="ax-bar-fill" />
        </g>
        <g className="ax-lock">
          <path d="M334 116 V98 a16 16 0 0 1 32 0 V116" className="ax-shackle" />
          <rect x="320" y="112" width="60" height="50" rx="12" className="ax-body" />
          <circle cx="350" cy="132" r="5" className="ax-hole" />
          <rect x="348" y="134" width="4" height="12" rx="2" className="ax-hole" />
        </g>
        <g className="ax-sparks">
          <path d="M392 92 l3 7 7 3 -7 3 -3 7 -3 -7 -7 -3 7 -3z" />
          <path d="M306 84 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" />
          <path d="M386 176 l2 4 4 2 -4 2 -2 4 -2 -4 -4 -2 4 -2z" />
        </g>
      </svg>
      <div className="ax-ticket-txt ax-float">
        <span className="ax-stub"><Handshake size={26} weight="duotone" /></span>
        <span className="ax-eyebrow">Partner code</span>
        <span className={`ax-code ax-code--${size} ${code ? '' : 'is-ph'}`}>{shown}{state === 'idle' || state === 'typing' ? <i className="ax-caret" /> : null}</span>
        <span className="ax-line">{open && <Check size={12} weight="bold" />}{line}</span>
      </div>
    </div>
  );
}

// Rounded ticket with a notch top and bottom at the stub (x = 100).
const TICKET = 'M38 40 H90 A10 10 0 0 0 110 40 H302 A18 18 0 0 1 320 58 V172 A18 18 0 0 1 302 190 H110 A10 10 0 0 0 90 190 H38 A18 18 0 0 1 20 172 V58 A18 18 0 0 1 38 40 Z';

export type StationState = 'done' | 'now' | 'todo';
export interface Station { key: string; icon: ReactNode; title: string; sub: ReactNode; state: StationState; action?: ReactNode }

/** Steps as stations on a path; the path is green up to the last finished step. */
export function Journey({ stations, label = 'Your progress' }: { stations: Station[]; label?: string }) {
  return (
    <ol className="ax-journey" aria-label={label} data-testid="access-journey" style={{ '--n': stations.length } as CSSProperties}>
      {stations.map((s, i) => (
        <li key={s.key} className={`ax-st is-${s.state}`} data-testid={`access-step-${s.key}`} aria-current={s.state === 'now' ? 'step' : undefined}>
          <span className="ax-node">
            {s.icon}
            {s.state === 'done' && <span className="ax-badge"><Check size={11} weight="bold" /></span>}
          </span>
          <span className="ax-st-txt">
            <span className="ax-step-n">Step {i + 1}{s.state === 'done' ? ' · done' : s.state === 'now' ? ' · next' : ''}</span>
            <b>{s.title}</b>
            <small>{s.sub}</small>
            {s.action}
          </span>
        </li>
      ))}
    </ol>
  );
}
