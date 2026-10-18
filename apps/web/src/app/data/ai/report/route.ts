import { ok } from '@/lib/mock-data';

// Mock-mode coach review. Content mirrors the shape of a real written review.
export function GET() {
  return ok({
    content:
      '**Longs are carrying this account.** Your long trades are net positive while shorts give most of it back — the edge is directional, not random.\n\n' +
      '- Losing trades are held far longer than winners. Exits, not entries, are the leak.\n' +
      '- BTCUSD produces the bulk of profit from very few wins; index CFDs are roughly flat.\n' +
      '- Tuesdays are the weakest day. Consider sizing down until the pattern changes.',
    cached: true,
    generated: true,
    stale: false,
    updatedAt: new Date(Date.now() - 3 * 3600_000).toISOString(),
  });
}
