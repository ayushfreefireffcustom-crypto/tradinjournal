import { ok } from '@/lib/mock-data';

// Mock-mode coach review, written against the seeded trades of the first mock account.
export function GET() {
  return ok({
    content:
      '**Shorts are carrying this account.** 44 shorts netted +$7.4k at a 75% win rate; 34 longs netted +$3.8k at 56%. Until longs earn it back, take them smaller.\n\n' +
      '- Losing trades are held about an hour longer than winners (6.3h vs 5.2h). Exits, not entries, are the leak.\n' +
      '- XAUUSD is your cleanest market: 11 of 12 trades won for +$3.7k.\n' +
      '- GBPUSD and EURUSD barely cover their costs: 22 trades between them for +$365. Trade them less, or not at all.',
    cached: true,
    generated: true,
    stale: false,
    updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  });
}
