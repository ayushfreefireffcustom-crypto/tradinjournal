// Broker-account domain types: the connection vocabulary and the verify probe
// result. All shared, serialized shapes (strings over the wire, never Decimal).

export type MarginMode = 'NETTING' | 'HEDGING';
export type AccountStatus = 'ACTIVE' | 'DISCONNECTED' | 'ERROR';

export interface VerifyResult {
  login: number;
  name: string;
  server: string;
  currency: string;
  balance: string;
  marginMode: MarginMode;
}
