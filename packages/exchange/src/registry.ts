// What the "Connect exchange" screen shows for each venue. Only DELTA_INDIA has
// an adapter; the rest are listed so the UI can say what's coming.

export interface ExchangeRegistryItem {
  id: string;
  displayName: string;
  availability: 'LIVE' | 'TESTNET_ONLY' | 'COMING_SOON';
  /** Fields the user pastes in. */
  requiredFields: Array<{ id: 'apiKey' | 'apiSecret' | 'passphrase'; label: string; secret: boolean }>;
  /** Plain-English steps for creating the key. */
  keyInstructions: string;
  /** Where users create API keys, per environment. */
  keyPageUrl: { testnet?: string; live?: string };
  /** Whether the venue requires an IP whitelist for trading keys. */
  ipWhitelistRequired: boolean;
}

export const exchangeRegistry: readonly ExchangeRegistryItem[] = [
  {
    id: 'DELTA_INDIA',
    displayName: 'Delta Exchange India',
    availability: 'TESTNET_ONLY',
    requiredFields: [
      { id: 'apiKey', label: 'API key', secret: false },
      { id: 'apiSecret', label: 'API secret', secret: true },
    ],
    keyInstructions:
      'Create an API key with Read Data and Trading permissions. Leave withdrawals off. Add the IP addresses shown here to the key\'s whitelist (Delta requires it for trading keys).',
    keyPageUrl: { testnet: 'https://testnet.delta.exchange/app/account/manageapikeys', live: 'https://www.delta.exchange/app/account/manageapikeys' },
    ipWhitelistRequired: true,
  },
  { id: 'BINANCE', displayName: 'Binance', availability: 'COMING_SOON', requiredFields: [], keyInstructions: '', keyPageUrl: {}, ipWhitelistRequired: true },
  { id: 'BYBIT', displayName: 'Bybit', availability: 'COMING_SOON', requiredFields: [], keyInstructions: '', keyPageUrl: {}, ipWhitelistRequired: false },
  { id: 'OKX', displayName: 'OKX', availability: 'COMING_SOON', requiredFields: [], keyInstructions: '', keyPageUrl: {}, ipWhitelistRequired: false },
];

export function getExchangeRegistryItem(id: string): ExchangeRegistryItem | undefined {
  return exchangeRegistry.find((x) => x.id === id);
}
