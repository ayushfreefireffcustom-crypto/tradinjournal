import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tradinjournal/config', () => ({ env: { MT5_BRIDGE_URL: 'http://bridge.test', MT5_BRIDGE_SHARED_SECRET: 's' } }));

const { getDeals, getDealsWithClock, verifyAccount, diagnoseLogin, bridgeFailure } = await import('../broker-connector.js');
const creds = { login: 1, password: 'p', server: 'S' };

function dealsResponse() {
  return new Response(JSON.stringify({
    total: 1,
    deals: [{ deal_ticket: 7, order_ticket: 8, position_id: 9, symbol: 'EURUSD', type: 0, entry: 0, volume: '0.10', price: '1.1', profit: '0', commission: '-0.5', swap: '0', fee: '0', deal_time: 1_760_000_000, comment: '' }],
  }), { status: 200 });
}

describe('bridge client', () => {
  const fetchMock = vi.fn();
  beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock); });
  afterEach(() => vi.unstubAllGlobals());

  it('sends the requested range and maps deals', async () => {
    fetchMock.mockResolvedValue(dealsResponse());
    const out = await getDeals(creds, { from: new Date('2026-10-01T05:06:07.890Z') });
    const body = JSON.parse(fetchMock.mock.calls[0]![1].body);
    expect(body.from_time).toBe('2026-10-01T05:06:07');
    expect(body.to_time).toBe('2035-01-01T00:00:00');
    expect(out[0]).toMatchObject({ dealTicket: '7', positionId: '9', type: 'BUY', entry: 'IN', volume: '0.10' });
  });

  it('returns the bridge server clock with the deals', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ total: 0, deals: [], server_time: 1_763_130_000, utc_now: 1_763_122_800 }), { status: 200 }));
    expect((await getDealsWithClock(creds)).clock).toEqual({ serverTime: 1_763_130_000, utcNow: 1_763_122_800 });
  });

  it('a bridge whose quotes are not moving sends no server time', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ total: 0, deals: [], server_time: null, utc_now: 1_763_122_800 }), { status: 200 }));
    expect((await getDealsWithClock(creds)).clock).toEqual({ serverTime: null, utcNow: 1_763_122_800 });
  });

  it('an older bridge (no clock fields) yields no clock and unchanged deal times', async () => {
    fetchMock.mockResolvedValue(dealsResponse());
    const r = await getDealsWithClock(creds);
    expect(r.clock).toBeNull();
    expect(r.deals[0]!.dealTime).toBe(new Date(1_760_000_000 * 1000).toISOString());
  });

  it('defaults to the whole history', async () => {
    fetchMock.mockResolvedValue(dealsResponse());
    await getDeals(creds);
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body).from_time).toBe('2020-01-01T00:00:00');
  });

  it('shares one request between identical concurrent calls', async () => {
    let release!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>(r => { release = r; }));
    const a = getDeals(creds), b = getDeals(creds);
    release(dealsResponse());
    const [ra, rb] = await Promise.all([a, b]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(ra).toEqual(rb);
    // …but a later call goes to the bridge again
    fetchMock.mockResolvedValue(dealsResponse());
    await getDeals(creds);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not share between different accounts', async () => {
    fetchMock.mockImplementation(async () => dealsResponse());
    await Promise.all([getDeals(creds), getDeals({ ...creds, login: 2 })]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('passes an abort signal and turns timeouts into a clear error', async () => {
    fetchMock.mockImplementation(async (_u: string, init: RequestInit) => {
      expect(init.signal).toBeInstanceOf(AbortSignal);
      throw Object.assign(new Error('timed out'), { name: 'TimeoutError' });
    });
    await expect(getDeals(creds)).rejects.toMatchObject({ statusCode: 502, message: expect.stringMatching(/took too long/) });
  });

  it('carries the bridge’s exact reason on the error (dropped login on a working terminal)', async () => {
    const detail = { code: 'LOGIN_REJECTED', reason: 'LOGIN_DROPPED', server: 'Elefin-Trade', message: 'terminal works but drops this login',
      mt5: { code: -10004, message: 'No IPC connection', meaning: 'no IPC connection (terminal dropped the link)' } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail }), { status: 422 }));
    await expect(getDeals(creds)).rejects.toMatchObject({
      name: 'BrokerAuthError',
      bridge: { code: 'LOGIN_REJECTED', reason: 'LOGIN_DROPPED', mt5: { code: -10004, message: 'No IPC connection' } },
    });
  });

  it('a terminal-side failure stays our problem and says why', async () => {
    const detail = { code: 'TERMINAL_DOWN', reason: 'PROCESS_NOT_RUNNING', message: 'terminal64.exe is not running', mt5: { code: -10004, message: 'No IPC connection' } };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail }), { status: 503 }));
    await expect(getDeals(creds)).rejects.toMatchObject({ name: 'BrokerConnectionError', message: expect.stringMatching(/on our side/), bridge: { code: 'TERMINAL_DOWN', reason: 'PROCESS_NOT_RUNNING' } });
  });

  it('reads the MT5 code out of an older bridge’s plain-text error', () => {
    const text = JSON.stringify({ detail: "MT5 terminal unreachable: (-10004, No IPC connection)" });
    expect(bridgeFailure(503, null, text)).toMatchObject({ code: 'HTTP_503', mt5: { code: -10004, message: 'No IPC connection' } });
  });

  it('diagnoseLogin returns the bridge report, and turns bridge trouble into a verdict instead of throwing', async () => {
    fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true, verdict: 'OK', explanation: 'fine' }), { status: 200 }));
    expect(await diagnoseLogin(creds)).toMatchObject({ ok: true, verdict: 'OK' });
    expect(JSON.parse(fetchMock.mock.calls[0]![1].body)).toEqual(creds);
    expect(fetchMock.mock.calls[0]![0]).toBe('http://bridge.test/diagnose');
    fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));
    expect(await diagnoseLogin(creds)).toMatchObject({ ok: false, verdict: 'BRIDGE_OUTDATED' });
    fetchMock.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    expect(await diagnoseLogin(creds)).toMatchObject({ ok: false, verdict: 'BRIDGE_UNREACHABLE', reason: 'NETWORK' });
  });

  it('maps an MT5 authorization failure to BrokerAuthError', async () => {
    fetchMock.mockResolvedValue(new Response('Authorization failed (-6)', { status: 503 }));
    await expect(verifyAccount(creds)).rejects.toMatchObject({ name: 'BrokerAuthError' });
  });

  it('a rejected login on connect names the server and what to check', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { code: 'LOGIN_REJECTED', server: 'XMGlobal-MT5 10', message: 'x' } }), { status: 422 }));
    await expect(verifyAccount(creds)).rejects.toMatchObject({ code: 'BROKER_AUTH_FAILED', message: expect.stringContaining('XMGlobal-MT5 10') });
  });

  it('a rejected login during sync keeps the update-your-password message', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { code: 'LOGIN_REJECTED', server: 'S' } }), { status: 422 }));
    await expect(getDeals(creds)).rejects.toMatchObject({ code: 'BROKER_AUTH_FAILED', message: expect.stringContaining('update it under Brokers') });
  });

  it('a terminal outage says it is on our side', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: { code: 'TERMINAL_DOWN' } }), { status: 503 }));
    await expect(verifyAccount(creds)).rejects.toMatchObject({ code: 'BROKER_CONNECTION_ERROR', message: expect.stringContaining('on our side') });
  });
});
