import { ok } from '@/lib/mock-data';
import { mockMaxPainBoard } from '@/lib/mock-liquidations';

export function GET() {
  if (process.env.NEXT_PUBLIC_USE_MOCKS !== 'true') return new Response('Not found', { status: 404 });
  return ok(mockMaxPainBoard());
}
