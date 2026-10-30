import { ok } from '@/lib/mock-data';

// Mock-mode Elefin check: no matching account, so the page shows its error state.
export function POST() {
  return ok({
    status: 'ELEFIN_REQUIRED',
    source: null,
    elefinStatus: 'FAILED',
    activityStatus: 'UNKNOWN',
    tradeCount7d: 0,
    minTradesRequired: 3,
    activityWindowDays: 7,
    isAdmin: false,
    partnerStatus: null,
    maintenance: { enabled: false, message: null },
  });
}
