// Contract test against the real Delta India TESTNET. Skipped unless
// DELTA_CONTRACT_TEST=1 and testnet keys are in .env.delta-testnet.local
// (git-ignored). It never fills: the one order is a post-only buy of 1
// contract at half the mark price, cancelled straight away.
//
//   pnpm --filter @tradinjournal/exchange test:testnet

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { DeltaIndiaExchange } from '../delta/adapter.js';
import { deltaConfigFromEnv } from '../delta/config.js';

function loadKeys(): Record<string, string> {
  const file = path.resolve(import.meta.dirname, '../../../../.env.delta-testnet.local');
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (m) out[m[1]!] = m[2]!.replace(/^"|"$/g, '');
  }
  return out;
}

const keys = loadKeys();
const creds = { apiKey: keys.DELTA_FOLLOWER_KEY ?? '', apiSecret: keys.DELTA_FOLLOWER_SECRET ?? '' };
const enabled = process.env.DELTA_CONTRACT_TEST === '1' && !!creds.apiKey && !!creds.apiSecret;

describe.skipIf(!enabled)('Delta testnet contract', () => {
  const ex = new DeltaIndiaExchange(deltaConfigFromEnv({ DELTA_ENV: 'testnet' }));

  it('verifies the key and reads the account', async () => {
    const v = await ex.verify(creds);
    expect(v.ok).toBe(true);
    expect(Number.isFinite(v.equityUsd)).toBe(true);
    expect(Array.isArray(await ex.getPositions(creds))).toBe(true);
  }, 20_000);

  it('places, finds and cancels a resting order', async () => {
    const mark = await ex.getMarkPrice('BTCUSD');
    expect(mark).toBeGreaterThan(0);
    const inst = (await ex.getInstrument('BTCUSD'))!;
    const price = Math.round((mark! * 0.5) / inst.tickSize) * inst.tickSize;
    const key = `contract-test:${Date.now()}`;
    const placed = await ex.placeOrder(creds, { symbol: 'BTCUSD', side: 'BUY', qty: 1, type: 'LIMIT', limitPrice: Number(price.toFixed(2)), tif: 'GTC', postOnly: true, clientOrderId: key });
    try {
      expect(placed.status).toBe('OPEN');
      expect((await ex.getOrder(creds, { clientOrderId: key }))?.exchangeOrderId).toBe(placed.exchangeOrderId);
      expect((await ex.getOpenOrders(creds, 'BTCUSD')).some((o) => o.exchangeOrderId === placed.exchangeOrderId)).toBe(true);
    } finally {
      const cancelled = await ex.cancelOrder(creds, { symbol: 'BTCUSD', exchangeOrderId: placed.exchangeOrderId });
      expect(cancelled.status).toBe('CANCELLED');
    }
  }, 30_000);
});
