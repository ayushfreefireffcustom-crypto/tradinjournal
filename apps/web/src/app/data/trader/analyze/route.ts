import { ok } from '@/lib/mock-data';
import { mockAnalyze, history } from '@/lib/mock-trader';
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  await new Promise(r => setTimeout(r, 900)); // feel of a real analysis
  const a = mockAnalyze(String(b.symbol ?? 'BTCUSDT'), Array.isArray(b.timeframes) && b.timeframes.length ? b.timeframes : ['1h']);
  history().unshift(a);
  return ok(a);
}
