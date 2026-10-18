import { ok } from '@/lib/mock-data';

export const dynamic = 'force-static';

// Mock-mode access status: a fully-entitled user, so the app shell renders.
export async function GET() {
  return ok({
    status: 'FULL_ACCESS',
    source: 'MANUAL_GRANT',
    elefinStatus: 'VERIFIED',
    activityStatus: 'ACTIVE',
    tradeCount7d: 12,
    minTradesRequired: 3,
    activityWindowDays: 7,
    isAdmin: false,
    maintenance: { enabled: false, message: null },
  });
}
