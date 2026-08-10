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
    section: 'CORE',
    items: [
      { id: 'dashboard', label: 'Macro Dashboard' },
      { id: 'confluence', label: 'Confluence Engine' },
      { id: 'scanner', label: 'Bull / Bear Scanner' },
      { id: 'regime', label: 'Market-Regime Matrix' },
    ],
  },
  {
    section: 'ECONOMY',
    items: [
      { id: 'calendar', label: 'Economic Calendar' },
      { id: 'yields', label: 'Yield Curve & Bonds' },
    ],
  },
  {
    section: 'POLICY & MONEY',
    items: [
      { id: 'fed', label: 'Federal Reserve' },
      { id: 'liquidity', label: 'Banking & Liquidity' },
    ],
  },
  {
    section: 'WORLD',
    items: [
      { id: 'fx', label: 'Forex Strength' },
      { id: 'geo', label: 'Geopolitical Risk' },
      { id: 'education', label: 'Education' },
    ],
  },
  {
    section: 'TRADEAI',
    items: [
      { id: 'signals', label: 'TradeAI Signals' },
      { id: 'paper', label: 'Paper Blotter' },
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
    <nav className="flex flex-col gap-4 p-3" data-testid="macro-side-nav">
      {MACRO_NAV.map(sec => (
        <div key={sec.section}>
          <div className="text-[9px] tracking-[0.2em] text-fg-3 px-2 mb-1.5">{sec.section}</div>
          <div className="flex flex-col gap-0.5">
            {sec.items.map(item => {
              const on = active === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => { onSelect(item.id); onMobileClose(); }}
                  data-testid={`macro-nav-${item.id}`}
                  data-active={on}
                  className={`text-left px-2.5 py-2 rounded-md text-[11px] tracking-[0.06em] transition-colors ${
                    on
                      ? 'bg-surface text-fg border-l-2 border-profit pl-2'
                      : 'text-fg-3 hover:text-fg hover:bg-surface/60'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden md:flex w-52 shrink-0 border-r border-border-soft overflow-y-auto no-scrollbar bg-surface/20">
        {NavBody}
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <>
          <div className="md:hidden fixed inset-0 z-40 bg-app/80 backdrop-blur-sm" onClick={onMobileClose} aria-hidden />
          <aside className="md:hidden fixed inset-y-0 left-0 z-50 w-[78%] max-w-[280px] border-r border-border bg-app overflow-y-auto fade-up">
            <div className="h-12 flex items-center justify-between px-3 border-b border-border">
              <span className="text-[11px] tracking-[0.16em] text-fg-3">MACRO MENU</span>
              <button type="button" onClick={onMobileClose} className="text-fg-3 hover:text-fg text-lg px-2" aria-label="Close">×</button>
            </div>
            {NavBody}
          </aside>
        </>
      )}
    </>
  );
}
