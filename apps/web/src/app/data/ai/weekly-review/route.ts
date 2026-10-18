import { ok } from '@/lib/mock-data';
const g = globalThis as unknown as { __wr?: { enabled: boolean; lastSentAt: string | null } };
const wr = () => (g.__wr ??= { enabled: true, lastSentAt: new Date(Date.now() - 5 * 864e5).toISOString() });
export function GET() { return ok(wr()); }
export async function PATCH(req: Request) { const b = await req.json().catch(() => ({})); wr().enabled = !!b.enabled; return ok(wr()); }
