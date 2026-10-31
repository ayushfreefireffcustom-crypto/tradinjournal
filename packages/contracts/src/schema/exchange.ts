import { z } from 'zod';

// ── Exchange connections (trading platform, Part B) ─────────────────────────

export const exchangeVenues = ['DELTA_INDIA'] as const;
export const exchangeEnvironments = ['TESTNET', 'LIVE'] as const;

const keyPart = z
  .string()
  .trim()
  .min(8, 'That looks too short to be an API key.')
  .max(256)
  .regex(/^[\x21-\x7e]+$/, 'API keys contain no spaces or special characters.');

export const connectExchangeSchema = z.object({
  exchange: z.enum(exchangeVenues),
  environment: z.enum(exchangeEnvironments).default('TESTNET'),
  label: z.string().trim().min(1).max(40).optional(),
  apiKey: keyPart,
  apiSecret: keyPart,
  passphrase: z.string().trim().min(1).max(128).optional(),
});
export type ConnectExchangeInput = z.infer<typeof connectExchangeSchema>;

export const updateExchangeSchema = z.object({
  label: z.string().trim().min(1).max(40),
});
export type UpdateExchangeInput = z.infer<typeof updateExchangeSchema>;

export interface ExchangeConnectionDto {
  id: string;
  exchange: (typeof exchangeVenues)[number];
  environment: (typeof exchangeEnvironments)[number];
  label: string;
  keyLast4: string;
  canTrade: boolean;
  status: 'ACTIVE' | 'INVALID' | 'REVOKED';
  lastError: string | null;
  lastCheckedAt: string | null;
  createdAt: string;
  /** This account is a copy-trading leader account. */
  isLeader: boolean;
  /** Active follows copying onto this account. */
  activeFollows: number;
}

export interface ExchangeCatalogItemDto {
  id: string;
  displayName: string;
  availability: 'LIVE' | 'TESTNET_ONLY' | 'COMING_SOON';
  environments: Array<(typeof exchangeEnvironments)[number]>;
  requiredFields: Array<{ id: 'apiKey' | 'apiSecret' | 'passphrase'; label: string; secret: boolean }>;
  keyInstructions: string;
  keyPageUrl: { testnet?: string; live?: string };
  ipWhitelistRequired: boolean;
  /** IPs to add to the key's whitelist. Empty when not configured. */
  whitelistIps: string[];
}
