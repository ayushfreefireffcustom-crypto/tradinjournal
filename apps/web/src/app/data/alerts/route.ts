import { ok } from '@/lib/mock-data';
import { alertStore } from '@/lib/mock-market';
import type { PriceAlert } from '@/lib/alerts-api';

export function GET() { return ok({ alerts: alertStore() }); }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const a: PriceAlert = { id: `al-${Date.now()}`, symbol: b.symbol, accountId: b.accountId ?? null, direction: b.direction, threshold: String(b.threshold), lastPrice: b.seedPrice != null ? String(b.seedPrice) : null, status: 'active', recurring: !!b.recurring, note: b.note ?? null, triggeredAt: null, createdAt: new Date().toISOString() };
  alertStore().unshift(a);
  return ok(a);
}
