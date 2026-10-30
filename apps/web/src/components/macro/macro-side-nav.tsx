'use client';

import { useEffect } from 'react';
import { IClose } from '@/components/v6/macro/ui';

export type MacroPanel =
  | 'dashboard'
  | 'confluence'
  | 'scanner'
  | 'regime'
  | 'fed'
  | 'liquidity'
  | 'yields'
  | 'calendar'
  | 'fx'
  | 'geo'
  | 'signals'
  | 'paper'
  | 'assistant'
  | 'access'
  | 'education';

export const MACRO_NAV: {
  section: string;
  items: { id: MacroPanel; label: string }[];
}[] = [
  {
    section: 'Overview',
    items: [
      { id: 'dashboard', label: 'Macro dashboard' },
      { id: 'confluence', label: 'Confluence engine' },
      { id: 'scanner', label: 'Bull / bear scanner' },
      { id: 'regime', label: 'Market-regime matrix' },
    ],
  },
  {
    section: 'Rates & data',
    items: [
      { id: 'calendar', label: 'Economic calendar' },
      { id: 'yields', label: 'Yield curve & bonds' },
    ],
  },
  {
    section: 'Policy & money',
    items: [
      { id: 'fed', label: 'Federal Reserve' },
      { id: 'liquidity', label: 'Banking & liquidity' },
    ],
  },
  {
    section: 'Global',
    items: [
      { id: 'fx', label: 'Forex strength' },
      { id: 'geo', label: 'Geopolitical risk' },
      { id: 'education', label: 'Education' },
    ],
  },
  {
    section: 'Members',
    items: [
      { id: 'signals', label: 'TradeAI signals' },
      { id: 'paper', label: 'Paper blotter' },
      { id: 'assistant', label: 'Macro AI' },
      { id: 'access', label: 'Access' },
    ],
  },
];

export function macroPanelLabel(id: MacroPanel): string {
  for (const sec of MACRO_NAV) for (const it of sec.items) if (it.id === id) return it.label;
  return 'Macro dashboard';
}

interface Props {
  active: MacroPanel;
  onSelect: (id: MacroPanel) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function MacroSideNav({ active, onSelect, mobileOpen, onMobileClose }: Props) {
  useEffect(() => {
    if (!mobileOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onMobileClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mobileOpen, onMobileClose]);

  const body = () => (
    <nav className="mc-nav" data-testid="macro-side-nav" aria-label="Macro sections">
      {MACRO_NAV.map(sec => (
        <div key={sec.section} className="mc-nav-sec">
          <small>{sec.section}</small>
          {sec.items.map(item => (
            <button key={item.id} type="button" aria-current={active === item.id ? 'page' : undefined}
              className={active === item.id ? 'on' : ''}
              onClick={() => { onSelect(item.id); onMobileClose(); }}
              data-testid={`macro-nav-${item.id}`} data-active={active === item.id}>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside className="x-card mc-rail">{body()}</aside>
      {mobileOpen && (
        <div className="x-dialog-scrim" onMouseDown={onMobileClose}>
          <div className="x-dialog mc-navdlg" role="dialog" aria-modal="true" aria-label="Macro sections" onMouseDown={e => e.stopPropagation()}>
            <div className="mc-dlg-hd">
              <h2>Sections</h2>
              <button type="button" onClick={onMobileClose} className="x-btn x-btn--icon x-btn--sm x-btn--ghost" aria-label="Close"><IClose size={16} /></button>
            </div>
            {body()}
          </div>
        </div>
      )}
    </>
  );
}
