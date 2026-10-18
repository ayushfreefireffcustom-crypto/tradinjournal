import { ok } from '@/lib/mock-data';
import { strategies } from '@/lib/mock-trader';
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const b = await req.json().catch(() => ({}));
  const s = strategies().find(x => x.id === id)!;
  s.lastBacktest = { trades: 38, wins: 21, losses: 17, hitRate: 0.55, expectancyPct: 0.18, maxDrawdownPct: 5.1, symbol: b.symbol, timeframe: b.timeframe, promote: { ok: true, reasons: [] } };
  return ok(s);
}
