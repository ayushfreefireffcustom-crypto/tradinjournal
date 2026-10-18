import { ok } from '@/lib/mock-data';
const g = globalThis as unknown as { __loc?: Record<string, unknown> };
const loc = () => (g.__loc ??= { country: 'IN', city: 'Raipur', postalCode: '492001', lat: null, lng: null, locationUpdatedAt: new Date().toISOString(), complete: true });
export function GET() { return ok(loc()); }
export async function PATCH(req: Request) { const b = await req.json().catch(() => ({})); Object.assign(loc(), b, { complete: true }); return ok(loc()); }
