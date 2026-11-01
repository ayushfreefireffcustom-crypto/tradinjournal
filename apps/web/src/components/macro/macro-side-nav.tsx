// The macro page's sections and views (rendered as tabs on /macro).

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
      { id: 'signals', label: 'SignalX' },
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
