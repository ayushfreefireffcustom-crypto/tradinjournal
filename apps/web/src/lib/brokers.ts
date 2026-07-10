// Curated list of supported brokers and their known MT5 server names.
// The exact server string must match the terminal's server list, so we also
// always allow a manual "Custom" entry as a fallback for anything not listed.
// Extend this list as more brokers are onboarded.

export interface BrokerDef {
  name: string;
  servers: string[];
}

export const BROKERS: BrokerDef[] = [
  {
    name: 'XM Global',
    servers: [
      'XMGlobal-MT5',
      'XMGlobal-MT5 2',
      'XMGlobal-MT5 3',
      'XMGlobal-MT5 4',
      'XMGlobal-MT5 5',
      'XMGlobal-MT5 6',
      'XMGlobal-MT5 7',
      'XMGlobal-MT5 8',
      'XMGlobal-MT5 9',
      'XMGlobal-MT5 10',
    ],
  },
  {
    name: 'XM International',
    servers: ['XMGlobalMU-MT5', 'XMGlobalMU-MT5 2', 'XMGlobalMU-MT5 3'],
  },
  {
    name: 'Xellion',
    servers: ['Xellion-Live'],
  },
];

// Sentinel for the "type it manually" option in the server dropdown.
export const CUSTOM_SERVER = '__custom__';

// Label shown for the "not in the list" broker option.
export const OTHER_BROKER = 'Other';
