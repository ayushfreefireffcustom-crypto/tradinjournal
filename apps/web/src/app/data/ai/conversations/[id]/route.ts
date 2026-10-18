import { ok } from '@/lib/mock-data';
import { threads } from '@/lib/mock-coach';
export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; return ok(threads().find(t => t.id === id) ?? null);
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const s = threads(); const i = s.findIndex(t => t.id === id); if (i >= 0) s.splice(i, 1);
  return ok({ ok: true });
}
