import { describe, expect, it } from 'vitest';
import { viaRelay } from '../http.js';

const R = 'https://relay.example.com';
const T = 't'.repeat(32);

describe('viaRelay', () => {
  it('sends Bybit and Binance futures through the relay with the token', () => {
    expect(viaRelay('https://api.bybit.com/v5/market/tickers?category=linear', R, T)).toEqual({
      url: 'https://relay.example.com/r/api.bybit.com/v5/market/tickers?category=linear',
      headers: { 'x-relay-token': T },
    });
    expect(viaRelay('https://fapi.binance.com/fapi/v1/premiumIndex', `${R}/`, T).url).toBe('https://relay.example.com/r/fapi.binance.com/fapi/v1/premiumIndex');
  });
  it('leaves other hosts, and everything when no relay is set, untouched', () => {
    expect(viaRelay('https://data-api.binance.vision/api/v3/klines', R, T)).toEqual({ url: 'https://data-api.binance.vision/api/v3/klines', headers: {} });
    expect(viaRelay('https://api.bybit.com/v5/market/time', undefined, T).headers).toEqual({});
    expect(viaRelay('https://api.bybit.com/v5/market/time', R, undefined).headers).toEqual({});
  });
});
