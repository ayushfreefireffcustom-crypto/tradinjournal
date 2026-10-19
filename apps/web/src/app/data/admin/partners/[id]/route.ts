import { ok } from '@/lib/mock-data';
import { mockAdminPartner } from '@/lib/mock-partner';
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const p = mockAdminPartner(id);
  if (!p) return Response.json({ error: { message: 'Partner not found' } }, { status: 404 });
  return ok(p);
}
