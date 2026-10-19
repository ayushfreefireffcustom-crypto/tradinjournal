import { ok } from '@/lib/mock-data';
import { mockPartnerOverview } from '@/lib/mock-partner';
export function GET() { return ok(mockPartnerOverview()); }
