// Z2: every route that can reach an exchange has a rate limit in front of it.
// Read straight off the router stack (markRateLimit tags), so a new route in
// these areas without a limit fails here. No database or network needed.
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { RouteInfo } from './routes.js';

/** Areas whose writes place, change or cancel orders, or call the exchange with a user's keys. */
const EXCHANGE_AREAS = ['/api/trading', '/api/exchanges', '/api/follows', '/api/leaders', '/api/options/orders', '/api/deployments', '/api/v1', '/api/marketplace/:id/subscribe', '/api/marketplace/subscriptions', '/api/strategies/:id/deployments'];

/** Reads that call the exchange on every request (not served from our own tables or a cache). */
const EXCHANGE_READS = ['GET /api/exchanges/:id/equity', 'GET /api/trading/quote', 'GET /api/trading/protection', 'GET /api/trading/instruments', 'GET /api/trading/overview', 'GET /api/v1/positions', 'GET /api/v1/accounts', 'GET /api/v1/orders'];

/** Writes in those areas that never reach an exchange, or are limited another way. */
const EXEMPT: Record<string, string> = {
  'POST /api/hooks/tv/:token': 'No session: limited per webhook inside handleAlert (30 a minute, tested in webhook.integration).',
};

const inArea = (r: RouteInfo) => EXCHANGE_AREAS.some((a) => r.template === a || r.template.startsWith(`${a}/`));

describe('rate limits on exchange routes', () => {
  let routes: RouteInfo[] = [];
  beforeAll(async () => {
    vi.resetModules();
    // Never a real database: nothing here queries one.
    Object.assign(process.env, { DATABASE_URL: 'postgresql://nobody@127.0.0.1:1/none', DIRECT_URL: 'postgresql://nobody@127.0.0.1:1/none', TRADING_ENABLED: 'true' });
    const { createApp } = await import('../app.js');
    const { listRoutes } = await import('./routes.js');
    routes = listRoutes(createApp());
  });

  it('limits every write that can reach an exchange', () => {
    const writes = routes.filter((r) => r.method !== 'GET' && inArea(r));
    expect(writes.length).toBeGreaterThan(30);
    expect(writes.filter((r) => !r.limits.length && !EXEMPT[`${r.method} ${r.template}`]).map((r) => `${r.method} ${r.template}`)).toEqual([]);
  });

  it('limits the reads that call the exchange each time', () => {
    const byKey = new Map(routes.map((r) => [`${r.method} ${r.template}`, r]));
    expect(EXCHANGE_READS.filter((k) => !byKey.has(k))).toEqual([]); // still real routes
    expect(EXCHANGE_READS.filter((k) => !byKey.get(k)!.limits.length)).toEqual([]);
    expect(Object.keys(EXEMPT).filter((k) => !byKey.has(k))).toEqual([]);
  });

  it('puts the order routes behind limits made for them', () => {
    const limitOf = (k: string) => routes.find((r) => `${r.method} ${r.template}` === k)?.limits ?? [];
    expect(limitOf('POST /api/trading/orders')).toContain('desk-close');
    expect(limitOf('POST /api/trading/positions/close')).toContain('desk-close');
    expect(limitOf('POST /api/options/orders')).toContain('options-orders');
    expect(limitOf('POST /api/follows/:id/stop')).toContain('copy-stop');
    expect(limitOf('POST /api/deployments/:id/:action')).toContain('deployment-control');
    expect(limitOf('POST /api/v1/orders')).toContain('apikey'); // router-level, per key
    expect(limitOf('POST /api/exchanges')).toContain('exchange-connect');
  });
});
