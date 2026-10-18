import { ok } from '@/lib/mock-data';
import { threads } from '@/lib/mock-coach';
export function GET() { return ok(threads().map(({ messages: _m, ...t }) => t)); }
