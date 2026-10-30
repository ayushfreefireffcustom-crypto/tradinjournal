import { ok } from '@/lib/mock-data';

export const dynamic = 'force-static';

// Mock-mode maintenance banner, switched on so /maintenance can be previewed.
export function GET() {
  return ok({
    enabled: true,
    message: 'We’re upgrading trade sync. We expect to be back within the hour.',
    toggledBy: null,
    toggledAt: null,
  });
}
