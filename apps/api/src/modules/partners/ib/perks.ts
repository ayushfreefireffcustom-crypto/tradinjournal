// TRADElogs features a partner can put in a package. The admin decides which ones are
// locked to package holders (Settings › lockedPerks); none are by default.
import type { PerkDto } from '@tradinjournal/contracts';

export interface PerkDef extends PerkDto {
  /** API prefixes the lock guards. */
  api: string[];
  /** Web routes the lock guards. */
  pages: string[];
}

export const PERKS: PerkDef[] = [
  { key: 'signalx', label: 'SignalX', description: 'AI chart analysis with entries, stops and targets', href: '/trader', api: ['/api/trader'], pages: ['/trader'] },
  { key: 'strategies', label: 'Strategy builder', description: 'Build, backtest and run rule-based strategies', href: '/strategies', api: ['/api/strategies', '/api/deployments'], pages: ['/strategies'] },
  { key: 'signals', label: 'Signals', description: 'Live technical signals across markets', href: '/signals', api: ['/api/signals'], pages: ['/signals'] },
  { key: 'screener', label: 'Screener', description: 'Filter markets by price, volume, funding and more', href: '/screener', api: ['/api/screener'], pages: ['/screener'] },
  { key: 'options', label: 'Options desk', description: 'Options chains, payoff builder and replay', href: '/options', api: ['/api/options'], pages: ['/options'] },
  { key: 'derivatives', label: 'Derivatives', description: 'Funding, open interest and squeezes', href: '/derivatives', api: ['/api/derivatives'], pages: ['/derivatives'] },
  { key: 'macro', label: 'Macro', description: 'Macro regime, indicators and the event window', href: '/macro', api: ['/api/macro'], pages: ['/macro'] },
  { key: 'coach', label: 'AI coach', description: 'Personal feedback on your trading', href: '/coach', api: ['/api/ai'], pages: ['/coach'] },
  { key: 'alerts', label: 'Alerts', description: 'Price and indicator alerts', href: '/alerts', api: ['/api/alerts', '/api/indicator-alerts'], pages: ['/alerts'] },
];

export function isPerk(key: string): boolean {
  return PERKS.some(p => p.key === key);
}

export function perkDtos(keys?: string[]): PerkDto[] {
  return PERKS.filter(p => !keys || keys.includes(p.key)).map(({ key, label, description, href }) => ({ key, label, description, href }));
}
