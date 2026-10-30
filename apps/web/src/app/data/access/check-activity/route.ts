import { ok } from '@/lib/mock-data';

// Mock-mode activity recheck: one trade short, so the page shows what's missing.
export function POST() {
  return ok({ active: false, tradeCount7d: 2, minTradesRequired: 3, activityWindowDays: 7 });
}
