import { ok } from '@/lib/mock-data';
import { mockCandles } from '@/lib/mock-market';
import { mockTradeCandles } from '@/lib/mock-insights';

// Broker-routed requests (accountId + window) get bars that pass through that
// mock account's own fills on the symbol, so trade review / replay charts line
// up with the trades; no trade near the window → no bars (the page's empty state).
export function GET(req: Request) {
  const u = new URL(req.url);
  const accountId = u.searchParams.get('accountId');
  const from = u.searchParams.get('from');
  const to = u.searchParams.get('to');
  const symbol = u.searchParams.get('symbol') ?? 'BTCUSDT';
  const tf = u.searchParams.get('tf') ?? '1h';
  if (accountId) {
    return ok({ candles: from && to ? mockTradeCandles(accountId, symbol, tf, Number(from), Number(to), Number(u.searchParams.get('limit') ?? 500)) : [] });
  }
  if (from) return ok({ candles: [] }); // no newer bars beyond "now"
  return ok({ candles: mockCandles(symbol, tf, Number(u.searchParams.get('limit') ?? 300), to ? Number(to) : undefined) });
}
