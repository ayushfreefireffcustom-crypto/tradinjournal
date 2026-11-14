import { ok } from '@/lib/mock-data';
import { mockLiquidationMap } from '@/lib/mock-liquidations';
import { LIQUIDATION_COINS, LIQUIDATION_WINDOWS, type LiquidationCoin, type LiquidationWindow } from '@/lib/liquidations-api';

export function GET(req: Request) {
  if (process.env.NEXT_PUBLIC_USE_MOCKS !== 'true') return new Response('Not found', { status: 404 });
  const q = new URL(req.url).searchParams;
  const coin = (LIQUIDATION_COINS as readonly string[]).includes(q.get('coin') ?? '') ? (q.get('coin') as LiquidationCoin) : 'BTC';
  const window = (LIQUIDATION_WINDOWS as readonly string[]).includes(q.get('window') ?? '') ? (q.get('window') as LiquidationWindow) : '48h';
  return ok(mockLiquidationMap(coin, window));
}
