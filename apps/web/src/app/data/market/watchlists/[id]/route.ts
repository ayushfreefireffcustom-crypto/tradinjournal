import { ok } from '@/lib/mock-data';
import { listStore, setWatch } from '@/lib/mock-market';

const fail = (status: number, message: string) => Response.json({ error: { message } }, { status });

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const lists = listStore();
  const list = lists.find((l) => l.id === id);
  if (!list) return fail(404, 'Watchlist not found');
  if (typeof b.name === 'string') {
    const name = b.name.trim();
    if (lists.some((l) => l.id !== id && l.name.toLowerCase() === name.toLowerCase())) return fail(409, `You already have a watchlist called “${name}”.`);
    list.name = name;
  }
  if (Array.isArray(b.symbols)) { list.symbols = [...new Set<string>(b.symbols)]; if (lists[0] === list) setWatch(list.symbols); }
  return ok(list);
}
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lists = listStore();
  const i = lists.findIndex((l) => l.id === id);
  if (i < 0) return fail(404, 'Watchlist not found');
  if (lists.length <= 1) return fail(409, 'Keep at least one watchlist. Rename this one or clear it instead.');
  lists.splice(i, 1);
  return ok({ deleted: true });
}
