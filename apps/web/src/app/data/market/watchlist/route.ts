import { ok } from '@/lib/mock-data';
import { watchStore, setWatch } from '@/lib/mock-market';

export function GET() { return ok({ symbols: watchStore() }); }
export async function PUT(req: Request) {
  const b = await req.json().catch(() => ({}));
  setWatch(Array.isArray(b.symbols) ? b.symbols : []);
  return ok({ symbols: watchStore() });
}
