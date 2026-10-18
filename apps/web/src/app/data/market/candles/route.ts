import { ok } from '@/lib/mock-data';
import { mockCandles } from '@/lib/mock-market';

// Broker-routed requests (accountId) return nothing so trade replays keep their
// fill-anchored illustrative path instead of unrelated mock prices.
export function GET(req: Request) {
  const u = new URL(req.url);
  if (u.searchParams.get('accountId')) return ok({ candles: [] });
  const from = u.searchParams.get('from');
  if (from) return ok({ candles: [] }); // no newer bars beyond "now"
  const to = u.searchParams.get('to');
  return ok({ candles: mockCandles(u.searchParams.get('symbol') ?? 'BTCUSDT', u.searchParams.get('tf') ?? '1h', Number(u.searchParams.get('limit') ?? 300), to ? Number(to) : undefined) });
}
