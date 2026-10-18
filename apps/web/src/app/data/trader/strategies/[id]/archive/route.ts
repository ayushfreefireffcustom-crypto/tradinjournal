import { ok } from '@/lib/mock-data';
import { strategies } from '@/lib/mock-trader';
export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params; const s = strategies().find(x => x.id === id)!; s.status = 'archived';
  return ok({ id, status: 'archived' });
}
