import { ok } from '@/lib/mock-data';
import { mockCalendar } from '@/lib/mock-news';

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const e = mockCalendar().find(x => x.id === id);
  return ok(e ? { ...e, sources: null } : null);
}
