import { ok } from '@/lib/mock-data';
const g = globalThis as unknown as { __np?: Record<string, unknown> };
const prefs = () => (g.__np ??= { timezone: 'Asia/Kolkata', inApp: true, email: true, push: false, minImpact: 'MEDIUM', currencies: [], categories: [], leadMinutes: 15, newsAlerts: true, priceAlerts: true, pushAvailable: true, vapidPublicKey: null });
export function GET() { return ok(prefs()); }
export async function PATCH(req: Request) { const b = await req.json().catch(() => ({})); Object.assign(prefs(), b); return ok(prefs()); }
