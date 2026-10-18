import { ok } from '@/lib/mock-data';
import { strategies } from '@/lib/mock-trader';
import type { TraderStrategy } from '@/lib/trader-api';
export function GET() { return ok(strategies()); }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const s: TraderStrategy = { id: `s${Date.now()}`, name: `Custom · ${b.symbol ?? 'BTCUSDT'}`, prompt: b.prompt, rules: { kind: 'price_vs_ema', direction: 'BOTH', timeframe: b.timeframe ?? '1h', fast: 20, slow: 50, stopAtr: 1.5, targetR: 2 }, status: 'draft', lastBacktest: null, emailOn: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  strategies().unshift(s); return ok(s);
}
