// What an Elefin connection keeps on PartnerBroker (no new tables): the encrypted key in
// `apiKey`, everything else (never secret) in `apiConfig` with provider "elefin".
import type { ElefinAbilityState, ElefinResource } from '@tradinjournal/contracts';

export interface ElefinConfig {
  provider: 'elefin';
  baseUrl: string;
  /** "••••a1b2". */
  keyHint: string;
  connectedAt: string;
  /** Paths that answered during the probe. */
  paths: Partial<Record<ElefinResource, string>>;
  abilities: Record<ElefinResource, ElefinAbilityState>;
  fields: { clients: string[]; accounts: string[] };
  counts: { clients: number | null; accounts: number | null };
  partnerRef: string | null;
  lastSuccessAt: string | null;
  /** 401/403 in a row. */
  authFailures: number;
  /** Set after repeated 401/403: no automatic syncs until the partner adds a key again. */
  pausedAt: string | null;
  manualSyncAt: string | null;
  /** A sync that would remove most of the list waits for a second sync to agree. */
  dropGuard: { count: number; at: string } | null;
}

type WithConfig = { apiConfig: unknown; apiKey?: string | null; method?: string };

export function elefinConfigOf(b: WithConfig | null | undefined): ElefinConfig | null {
  const c = b?.apiConfig as Partial<ElefinConfig> | null | undefined;
  if (!c || typeof c !== 'object' || c.provider !== 'elefin' || typeof c.baseUrl !== 'string') return null;
  return {
    provider: 'elefin', baseUrl: c.baseUrl, keyHint: c.keyHint ?? '••••', connectedAt: c.connectedAt ?? new Date(0).toISOString(),
    paths: c.paths ?? {}, abilities: c.abilities ?? { profile: 'skipped', clients: 'skipped', accounts: 'skipped' },
    fields: c.fields ?? { clients: [], accounts: [] }, counts: c.counts ?? { clients: null, accounts: null },
    partnerRef: c.partnerRef ?? null, lastSuccessAt: c.lastSuccessAt ?? null, authFailures: c.authFailures ?? 0,
    pausedAt: c.pausedAt ?? null, manualSyncAt: c.manualSyncAt ?? null, dropGuard: c.dropGuard ?? null,
  };
}

/** An Elefin API connection that can sync: method API, Elefin config and a stored key. */
export function isElefinConnected(b: WithConfig | null | undefined): boolean {
  return !!b && b.method === 'API' && !!b.apiKey && !!elefinConfigOf(b);
}

/** Last four characters of the key, never more. */
export const keyHint = (token: string): string => `••••${token.trim().slice(-4)}`;
