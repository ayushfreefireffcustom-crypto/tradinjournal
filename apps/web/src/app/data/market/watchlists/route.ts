import { ok } from '@/lib/mock-data';
import { listStore } from '@/lib/mock-market';

const fail = (status: number, message: string) => Response.json({ error: { message } }, { status });

export function GET() { return ok({ lists: listStore() }); }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? '').trim();
  const lists = listStore();
  if (!name || name.length > 32) return fail(422, 'Give the list a name of up to 32 characters.');
  if (lists.length >= 8) return fail(409, 'You can have up to 8 watchlists. Delete one to add another.');
  if (lists.some((l) => l.name.toLowerCase() === name.toLowerCase())) return fail(409, `You already have a watchlist called “${name}”.`);
  const list = { id: `wl-${Date.now()}`, name, symbols: Array.isArray(b.symbols) ? [...new Set<string>(b.symbols)] : [] };
  lists.push(list);
  return Response.json({ data: list }, { status: 201 });
}
