import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@tradinjournal/config', () => ({ env: { MT5_BRIDGE_URL: 'http://bridge.test', MT5_BRIDGE_SHARED_SECRET: 's' } }));

const { getDeals, verifyAccount } = await import('../broker-connector.js');
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

  it('maps an MT5 authorization failure to BrokerAuthError', async () => {
    fetchMock.mockResolvedValue(new Response('Authorization failed (-6)', { status: 503 }));
    await expect(verifyAccount(creds)).rejects.toMatchObject({ name: 'BrokerAuthError' });
  });
});
