'use client';

// Small pieces shared by the SignalX and AI coach pages.
import type { ReactNode } from 'react';
import { SideChip } from '@/components/v6/desk';
import '@/styles/v6/ai.css';

const svg = (d: ReactNode, size = 16, sw = 1.7) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>
);

export const IScan = ({ size = 16 }: { size?: number }) => svg(<><path d="M4 8V6a2 2 0 0 1 2-2h2M16 4h2a2 2 0 0 1 2 2v2M20 16v2a2 2 0 0 1-2 2h-2M8 20H6a2 2 0 0 1-2-2v-2" /><path d="M7 14l3-3 2.5 2.5L17 9" /></>, size);
export const ISearchLine = ({ size = 16 }: { size?: number }) => svg(<><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>, size);
export const IRefresh = ({ size = 16, spin }: { size?: number; spin?: boolean }) => (
  <span className={spin ? 'ai-ib ai-spin' : 'ai-ib'}>{svg(<path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />, size)}</span>
);
export const ISend = ({ size = 17 }: { size?: number }) => svg(<path d="M12 19V5M5 12l7-7 7 7" />, size, 1.9);
export const IChevR = ({ size = 14 }: { size?: number }) => svg(<path d="m9 6 6 6-6 6" />, size);
export const IHistory = ({ size = 16 }: { size?: number }) => svg(<><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></>, size);
export const ICopy = ({ size = 14 }: { size?: number }) => svg(<><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h8" /></>, size);
export const IRedo = ({ size = 14 }: { size?: number }) => svg(<><path d="M20 12a8 8 0 1 1-2.3-5.7" /><path d="M20 4v5h-5" /></>, size);
export const IExt = ({ size = 11 }: { size?: number }) => svg(<path d="M7 17 17 7M9 7h8v8" />, size, 1.8);

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <svg className="ai-spin" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeOpacity=".2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

/** Long / Short chip; "Wait" calls get a neutral tag. */
export function DirChip({ dir, testId }: { dir: 'LONG' | 'SHORT' | 'WAIT' | string; testId?: string }) {
  if (dir === 'LONG' || dir === 'SHORT') return <span className="ai-if" data-testid={testId}><SideChip dir={dir} /></span>;
  return <span className="x-tag" data-testid={testId}>Wait</span>;
}

/** "Coach is working" dots shown before the first token. */
export function Thinking({ phase }: { phase: 'searching' | 'thinking' }) {
  const searching = phase === 'searching';
  return (
    <span className="ai-think" role="status" data-testid={searching ? 'coach-searching' : 'coach-thinking'}>
      <i /><i /><i /><span>{searching ? 'Searching the web' : 'Reading your trades'}</span>
    </span>
  );
}

export function SignalDisclaimer() {
  return (
    <p className="ai-legal" data-testid="macro-compliance">
      <b>Educational use only.</b> SignalX calls and strategy backtests are analytical, paper-trading tools: not personalised
      investment advice, not SEBI-registered recommendations and not guaranteed forecasts. Markets carry substantial risk of
      loss. Do your own research and consult a qualified professional before trading.
    </p>
  );
}
