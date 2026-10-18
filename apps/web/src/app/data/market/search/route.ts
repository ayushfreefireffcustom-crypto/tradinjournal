import { ok } from '@/lib/mock-data';
import { MOCK_SYMBOLS } from '@/lib/mock-market';

export function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').toUpperCase();
  return ok({ symbols: MOCK_SYMBOLS.filter(s => s.symbol.includes(q) || s.name.toUpperCase().includes(q)).map(s => ({ symbol: s.symbol, name: s.name, assetClass: s.assetClass, provider: 'mock' })) });
}
