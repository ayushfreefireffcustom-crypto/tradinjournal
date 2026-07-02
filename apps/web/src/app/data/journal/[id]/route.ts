import { updateJournal, deleteJournal, ok } from '@/lib/mock-data';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  return ok(updateJournal(id, body));
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return ok({ ok: deleteJournal(id) });
}
