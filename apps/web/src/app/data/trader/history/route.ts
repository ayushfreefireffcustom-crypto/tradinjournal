import { ok } from '@/lib/mock-data';
import { history } from '@/lib/mock-trader';
export function GET() { return ok(history().slice(0, 8)); }
