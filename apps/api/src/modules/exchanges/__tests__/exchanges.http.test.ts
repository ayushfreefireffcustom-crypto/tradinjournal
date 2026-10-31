// HTTP gates for /api/exchanges: absent when TRADING_ENABLED is off, and
// sign-in required when on. Uses the real app against the local test DB.
//   TRADING_TEST_DB=postgresql://tj@localhost:5444/tradinjournal_test pnpm --filter @tradinjournal/api test
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';

const DB = process.env.TRADING_TEST_DB;
const local = !!DB && /localhost|127\.0\.0\.1/.test(DB);

async function serve(tradingEnabled: boolean) {
  vi.resetModules();
  process.env.DATABASE_URL = DB;
  process.env.DIRECT_URL = DB;
  process.env.TRADING_ENABLED = tradingEnabled ? 'true' : 'false';
  const { createApp } = await import('../../../app.js');
  const server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise((r) => server.close(r)) };
}

describe.skipIf(!local)('/api/exchanges HTTP gates', () => {
  let close: (() => Promise<unknown>) | null = null;
  afterEach(async () => {
    await close?.();
    close = null;
  });

  it('does not exist while trading is off', async () => {
    const s = await serve(false);
    close = s.close;
    expect((await fetch(`${s.base}/api/exchanges`)).status).toBe(404);
    expect((await fetch(`${s.base}/api/exchanges/catalog`)).status).toBe(404);
  });

  it('requires sign-in for every route when on', async () => {
    const s = await serve(true);
    close = s.close;
    const calls: Array<[string, string]> = [
      ['GET', '/api/exchanges'],
      ['GET', '/api/exchanges/catalog'],
      ['POST', '/api/exchanges'],
      ['POST', '/api/exchanges/x/test'],
      ['PATCH', '/api/exchanges/x'],
      ['DELETE', '/api/exchanges/x'],
      ['GET', '/api/exchanges/x/equity'],
    ];
    for (const [method, path] of calls) {
      const origin = process.env.CORS_ORIGIN?.split(',')[0] ?? 'http://localhost:3000';
      const res = await fetch(`${s.base}${path}`, { method, headers: { 'content-type': 'application/json', origin }, body: method === 'GET' ? undefined : '{}' });
      expect(res.status, `${method} ${path}`).toBe(401);
    }
  });
});
