// Brokers a partner can be an IB with. Matching a client's MT5 account to a broker
// uses the broker name and server the account was connected with.
import type { BrokerCatalogEntryDto, IbMethodDto } from '@tradinjournal/contracts';
import { env } from '@tradinjournal/config';

interface BrokerDef {
  key: string;
  label: string;
  /** Matches the MT5 broker name or server. */
  match: RegExp;
  listHint: string;
}

export const BROKERS: BrokerDef[] = [
  { key: 'elefin', label: 'Elefin', match: /elefin/i, listHint: 'Account ID and email from your Elefin partner area' },
  { key: 'xellion', label: 'Xellion', match: /xellion/i, listHint: 'Account ID and email from your Xellion partner list' },
  { key: 'exness', label: 'Exness', match: /exness/i, listHint: 'Client account numbers from Exness Partnership › Clients' },
  { key: 'xm', label: 'XM', match: /\bxm(global|trading)?\b|xmglobal|trading point/i, listHint: 'MT5 account IDs from the XM Partners client report' },
  { key: 'vantage', label: 'Vantage', match: /vantage/i, listHint: 'Account numbers from the Vantage IB portal' },
  { key: 'icmarkets', label: 'IC Markets', match: /ic ?markets|raw trading/i, listHint: 'Account numbers from the IC Markets IB portal' },
  { key: 'pepperstone', label: 'Pepperstone', match: /pepperstone/i, listHint: 'Account numbers from the Pepperstone partner portal' },
  { key: 'other', label: 'Other broker', match: /$^/, listHint: 'Account numbers (and emails) of the clients under your IB' },
];


export function brokerLabel(key: string): string {
  return BROKERS.find(b => b.key === key)?.label ?? key;
}

export function isKnownBroker(key: string): boolean {
  return BROKERS.some(b => b.key === key);
}

/**
 * The catalog key for a connected account, or null when it matches no broker.
 * `extra` holds partner-defined server matches for the "other" broker.
 */
export function brokerKeyFor(account: { broker: string; server: string }, extra: { serverMatch: string | null }[] = []): string | null {
  const text = `${account.broker} ${account.server}`;
  const hit = BROKERS.find(b => b.match.test(text));
  if (hit) return hit.key;
  const s = account.server.toLowerCase();
  if (extra.some(e => e.serverMatch && s.includes(e.serverMatch.toLowerCase()))) return 'other';
  return null;
}

/** Elefin only: while the platform gate is on, clients can only use Elefin accounts, so Elefin is the only IB broker worth connecting. */
export const ibBrokersOnlyElefin = (): boolean => env.PLATFORM_ACCESS_ENABLED;

export function catalog(): BrokerCatalogEntryDto[] {
  return BROKERS.filter(b => !ibBrokersOnlyElefin() || b.key === 'elefin').map(b => ({
    key: b.key, label: b.label, listHint: b.listHint,
    // Broker postbacks work for every broker; the REST API needs the host approved by an admin.
    methods: ['LIST', 'SHEET', 'API'] as IbMethodDto[],
  }));
}
