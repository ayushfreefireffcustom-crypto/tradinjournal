import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tradinjournal/config', () => ({ env: { MT5_BRIDGE_URL: 'http://bridge.test', MT5_BRIDGE_SHARED_SECRET: 's' } }));

const { createMt5Provider } = await import('../providers/mt5.js');
const provider = createMt5Provider();
const broker = { login: 1, password: 'p', server: 'Elefin-Trade' };
const NY_CLOSE = { zone: 'America/New_York', shiftMin: 420 };
// Bars as the bridge sends them: server wall-clock seconds.
const wallS = (local: string) => Date.parse(`${local}Z`) / 1000;
const bar = (time: number) => ({ time, open: '1', high: '1', low: '1', close: '1', volume: '1', spread: 0 });

describe('MT5 candles and the server clock', () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockImplementation(async () => new Response(JSON.stringify({ candles: [bar(wallS('2026-07-15T12:00:00'))], total: 1 }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('without a clock model, passes bar times through unchanged', async () => {
    const [c] = await provider.getCandles('EURUSD', '1h', { limit: 1, broker });
    expect(new Date(c!.openTime).toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('converts intraday bars to real UTC', async () => {
    const [c] = await provider.getCandles('EURUSD', '1h', { limit: 1, broker, serverTz: NY_CLOSE });
    expect(new Date(c!.openTime).toISOString()).toBe('2026-07-15T09:00:00.000Z');
  });

  it('keeps daily bars on their server date', async () => {
    const [c] = await provider.getCandles('EURUSD', '1d', { limit: 1, broker, serverTz: NY_CLOSE });
    expect(new Date(c!.openTime).toISOString()).toBe('2026-07-15T12:00:00.000Z');
  });

  it('asks the bridge for the window in server wall clock', async () => {
    const from = Date.parse('2026-07-15T09:00:00Z') / 1000;
    await provider.getCandles('EURUSD', '1h', { from, to: from + 3600, broker, serverTz: NY_CLOSE });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.from_time).toBe('2026-07-15T12:00:00.000Z');
    expect(body.to_time).toBe('2026-07-15T13:00:00.000Z');
  });
});
