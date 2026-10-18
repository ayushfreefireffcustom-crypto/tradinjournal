import { ok } from '@/lib/mock-data';
import { alertStore } from '@/lib/mock-market';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = await req.json().catch(() => ({}));
  const a = alertStore().find(x => x.id === id);
  if (a) { if (b.status) a.status = b.status; if (b.threshold != null) a.threshold = String(b.threshold); if (b.recurring != null) a.recurring = b.recurring; }
  return ok(a);
}
export async function DELETE(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const s = alertStore(); const i = s.findIndex(x => x.id === id); if (i >= 0) s.splice(i, 1);
  return ok({ ok: true });
}
