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
import type { AccountEvent } from '../types.js';
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
const leaderCreds = { apiKey: keys.DELTA_LEADER_KEY ?? '', apiSecret: keys.DELTA_LEADER_SECRET ?? '' };
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

  /** Collect stream events until `done` returns true or the timeout passes. */
  async function collect(c: typeof creds, ms: number, done: (evs: AccountEvent[]) => boolean, during?: () => Promise<void>) {
    const events: AccountEvent[] = [];
    const errors: Error[] = [];
    const handle = await ex.streamAccount(c, { onEvent: (e) => events.push(e), onError: (e) => errors.push(e) });
    try {
      const until = Date.now() + ms;
      // Subscribed once the snapshots land; give them a moment before acting.
      await new Promise((r) => setTimeout(r, 3000));
      if (during) await during();
      while (Date.now() < until && !done(events)) await new Promise((r) => setTimeout(r, 200));
    } finally {
      handle.close();
    }
    return { events, errors };
  }

  it("streams the leader's open positions as a snapshot (read only)", async () => {
    const rest = await ex.getPositions(leaderCreds);
    const { events, errors } = await collect(leaderCreds, 15_000, (evs) => evs.some((e) => e.kind === 'position' && e.action === 'snapshot'));
    expect(errors).toEqual([]);
    const snap = events.filter((e): e is Extract<AccountEvent, { kind: 'position' }> => e.kind === 'position' && e.action === 'snapshot');
    // The stream and REST agree on every open position.
    for (const p of rest) expect(snap.find((e) => e.position.symbol === p.symbol)?.position.size, p.symbol).toBe(p.size);
  }, 30_000);

  it('streams an order being created and cancelled', async () => {
    const mark = (await ex.getMarkPrice('BTCUSD'))!;
    const inst = (await ex.getInstrument('BTCUSD'))!;
    const price = Number((Math.round((mark * 0.5) / inst.tickSize) * inst.tickSize).toFixed(2));
    const key = `stream-test:${Date.now()}`;
    let placedId = '';
    const { events, errors } = await collect(creds, 25_000,
      (evs) => evs.some((e) => e.kind === 'order' && e.order.exchangeOrderId === placedId && e.order.status === 'CANCELLED'),
      async () => {
        const placed = await ex.placeOrder(creds, { symbol: 'BTCUSD', side: 'BUY', qty: 1, type: 'LIMIT', limitPrice: price, tif: 'GTC', postOnly: true, clientOrderId: key });
        placedId = placed.exchangeOrderId;
        await new Promise((r) => setTimeout(r, 1500));
        await ex.cancelOrder(creds, { symbol: 'BTCUSD', exchangeOrderId: placedId });
      });
    expect(errors).toEqual([]);
    const mine = events.filter((e): e is Extract<AccountEvent, { kind: 'order' }> => e.kind === 'order' && e.order.exchangeOrderId === placedId);
    expect(mine.some((e) => e.order.status === 'OPEN' && e.order.limitPrice === price)).toBe(true);
    expect(mine.at(-1)!.order.status).toBe('CANCELLED');
    expect(mine.every((e) => e.order.filledQty === 0 && e.order.symbol === 'BTCUSD' && e.order.side === 'BUY')).toBe(true);
  }, 45_000);
});
