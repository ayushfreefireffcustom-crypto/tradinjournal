'use client';

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

interface Props {
  active: MacroPanel;
  onSelect: (id: MacroPanel) => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

export default function MacroSideNav({ active, onSelect, mobileOpen, onMobileClose }: Props) {
  const NavBody = (
    <nav className="mn" data-testid="macro-side-nav" aria-label="Macro sections">
      {MACRO_NAV.map(sec => (
        <div key={sec.section} className="mn-sec">
          <div className="mn-h">{sec.section}</div>
          {sec.items.map(item => (
            <button key={item.id} type="button" aria-current={active === item.id ? 'page' : undefined}
              onClick={() => { onSelect(item.id); onMobileClose(); }} data-testid={`macro-nav-${item.id}`} data-active={active === item.id}>
              {item.label}
            </button>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <>
      <aside className="v3-card mn-rail">{NavBody}</aside>
      {mobileOpen && (
        <div className="v3-modal mn-drawer" role="dialog" aria-modal="true" aria-label="Macro menu">
          <div className="v3-modal-bg" onClick={onMobileClose} />
          <div className="v3-modal-card">
            <header className="v3-modal-hd"><h2>Macro menu</h2><button type="button" onClick={onMobileClose} className="v3-modal-x" style={{ marginLeft: 'auto' }} aria-label="Close">×</button></header>
            <div className="v3-modal-bd">{NavBody}</div>
          </div>
        </div>
      )}
    </>
  );
}
