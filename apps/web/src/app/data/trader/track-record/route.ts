import { ok } from '@/lib/mock-data';
import { trackRecord } from '@/lib/mock-trader';
export function GET() { return ok(trackRecord()); }
