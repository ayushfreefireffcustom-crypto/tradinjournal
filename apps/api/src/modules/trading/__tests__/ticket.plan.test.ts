import { describe, expect, it } from 'vitest';
import type { OrderTicketInput, TicketQuoteDto } from '@tradinjournal/contracts';
import { planTicket, toTick } from '../ticket.plan.js';

// BTCUSD on Delta: 0.001 BTC per contract, whole contracts, $0.5 ticks, 100× max.
const Q: TicketQuoteDto = { symbol: 'BTCUSD', live: true, markPrice: 70_000, contractMultiplier: 0.001, qtyStep: 1, minQty: 1, tickSize: 0.5, maxLeverage: 100, currentLeverage: 10, equityUsd: 1000, availableUsd: 800, position: 0, environment: 'TESTNET' };
const T = (over: Partial<OrderTicketInput> = {}): OrderTicketInput => ({ connectionId: 'c', symbol: 'BTCUSD', side: 'BUY', type: 'MARKET', size: { mode: 'contracts', value: 2 }, requestId: 'req-12345678', ...over });
const plan = (t: Partial<OrderTicketInput> = {}, q: Partial<TicketQuoteDto> = {}) => planTicket(T(t), { ...Q, ...q });

describe('toTick', () => {
  it('rounds to the tick without float noise', () => {
    expect(toTick(70_000.26, 0.5)).toBe(70_000.5);
    expect(toTick(0.1 + 0.2, 0.1)).toBe(0.3);
    expect(toTick(2269.756, 0.05)).toBe(2269.75);
    expect(toTick(123.4567, 0)).toBe(123.4567);
  });
});

describe('planTicket', () => {
  it('builds a plain market buy with notional, margin and the current leverage', () => {
    const p = plan();
    expect(p).toMatchObject({ ok: true, qty: 2, refPrice: 70_000, notionalUsd: 140, marginUsd: 14, leverage: 10, tif: null, errors: [] });
  });

  it('sizes by USD and by risk, rounding down to whole contracts', () => {
    expect(plan({ size: { mode: 'usd', value: 250 } }).qty).toBe(3); // 250 / 70 = 3.57 → 3
    // Risk 1 % of $1000 = $10, stop $500 below → $0.5 loss per contract → 20 contracts.
    const r = plan({ size: { mode: 'risk', value: 1 }, stopLoss: 69_500 });
    expect(r).toMatchObject({ ok: true, qty: 20, riskUsd: 10 });
    expect(plan({ size: { mode: 'risk', value: 1 } }).errors).toContain('Sizing by risk needs a stop-loss: that’s where the risk is measured to.');
  });

  it('refuses sizes under one contract and says what one costs', () => {
    const p = plan({ size: { mode: 'usd', value: 50 } });
    expect(p.ok).toBe(false);
    expect(p.errors[0]).toMatch(/smallest order: 1 contract \(one contract is about \$70\.00\)/);
    expect(plan({ size: { mode: 'contracts', value: 2.7 } })).toMatchObject({ qty: 2, ok: true });
    expect(plan({ size: { mode: 'contracts', value: 2.7 } }).warnings[0]).toMatch(/Rounded down to 2 contracts/);
  });

  it('needs prices for limit and stop orders and rounds them to the tick', () => {
    expect(plan({ type: 'LIMIT' }).errors).toContain('Enter a limit price.');
    expect(plan({ type: 'STOP_MARKET' }).errors).toContain('Enter a trigger price.');
    const p = plan({ type: 'LIMIT', limitPrice: 69_000.3 });
    expect(p).toMatchObject({ ok: true, limitPrice: 69_000.5, tif: 'GTC', refPrice: 69_000.5 });
  });

  it('warns when a limit would fill straight away, and blocks it if post-only', () => {
    expect(plan({ type: 'LIMIT', limitPrice: 71_000 }).warnings.join()).toMatch(/fill straight away/);
    expect(plan({ type: 'LIMIT', limitPrice: 71_000, postOnly: true }).errors.join()).toMatch(/post-only buy above the mark/);
    expect(plan({ side: 'SELL', type: 'LIMIT', limitPrice: 69_000, postOnly: true }).errors.join()).toMatch(/post-only sell below the mark/);
    expect(plan({ type: 'LIMIT', limitPrice: 69_000, postOnly: true, tif: 'IOC' }).errors.join()).toMatch(/Post-only needs good-till-cancelled/);
  });

  it('rejects stops on the wrong side of the mark', () => {
    expect(plan({ type: 'STOP_MARKET', stopPrice: 69_000 }).errors.join()).toMatch(/buy stop triggers when the price rises/);
    expect(plan({ side: 'SELL', type: 'STOP_MARKET', stopPrice: 71_000 }).errors.join()).toMatch(/sell stop triggers when the price falls/);
    expect(plan({ type: 'STOP_MARKET', stopPrice: 71_000 })).toMatchObject({ ok: true, refPrice: 71_000 });
    expect(plan({ type: 'STOP_LIMIT', stopPrice: 71_000, limitPrice: 71_200 })).toMatchObject({ ok: true, stopPrice: 71_000, limitPrice: 71_200 });
  });

  it('warns about prices far from the mark', () => {
    expect(plan({ type: 'LIMIT', limitPrice: 50_000 }).warnings.join()).toMatch(/over 20% from the mark/);
  });

  it('checks take-profit and stop-loss sides, and allows them only on market entries', () => {
    expect(plan({ takeProfit: 72_000, stopLoss: 69_000 })).toMatchObject({ ok: true, takeProfit: 72_000, stopLoss: 69_000, riskUsd: 2 });
    expect(plan({ takeProfit: 69_000 }).errors.join()).toMatch(/take-profit must be above/);
    expect(plan({ stopLoss: 71_000 }).errors.join()).toMatch(/stop-loss must be below/);
    expect(plan({ side: 'SELL', takeProfit: 72_000 }).errors.join()).toMatch(/take-profit must be below/);
    expect(plan({ side: 'SELL', stopLoss: 69_000 }).errors.join()).toMatch(/stop-loss must be above/);
    expect(plan({ type: 'LIMIT', limitPrice: 69_000, takeProfit: 75_000 }).errors.join()).toMatch(/add them from the position/);
  });

  it('checks leverage against the contract maximum', () => {
    expect(plan({ leverage: 101 }).errors.join()).toMatch(/at most 100× leverage/);
    expect(plan({ leverage: 20 })).toMatchObject({ ok: true, leverage: 20, currentLeverage: 10, marginUsd: 7 });
  });

  it('blocks orders the available balance cannot cover, and warns near the limit', () => {
    // 2 contracts = $140 at 1× = $140 margin; $100 free.
    expect(plan({ leverage: 1 }, { availableUsd: 100 }).errors.join()).toMatch(/Not enough available balance: this needs about \$140 of margin and \$100 is free/);
    expect(plan({ leverage: 1 }, { availableUsd: 160 }).warnings.join()).toMatch(/over 80% of your available balance/);
    // Unknown available balance: no false block.
    expect(plan({ leverage: 1 }, { availableUsd: null }).ok).toBe(true);
  });

  it('makes reduce-only orders actually reduce', () => {
    expect(plan({ reduceOnly: true }).errors.join()).toMatch(/no BTCUSD position to reduce/);
    expect(plan({ reduceOnly: true }, { position: 3 }).errors.join()).toMatch(/would add to your long/);
    const ok = plan({ side: 'SELL', reduceOnly: true, size: { mode: 'contracts', value: 5 } }, { position: 3, availableUsd: 0 });
    expect(ok.ok).toBe(true); // closing never needs free margin
    expect(ok.warnings.join()).toMatch(/Only 3 contracts are open/);
    expect(plan({ side: 'SELL', reduceOnly: true, takeProfit: 60_000 }, { position: 3 }).errors.join()).toMatch(/can’t have its own take-profit/);
  });

  it('needs a confirmation for real money, a live contract and a mark for market orders', () => {
    expect(plan({}, { environment: 'LIVE' }).errors.join()).toMatch(/real-money account/);
    expect(plan({ confirmLive: true }, { environment: 'LIVE' }).ok).toBe(true);
    expect(plan({}, { live: false }).errors.join()).toMatch(/isn't trading right now/);
    expect(plan({}, { markPrice: null }).errors.join()).toMatch(/No mark price/);
  });
});
