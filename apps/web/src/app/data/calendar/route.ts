import { ok } from '@/lib/mock-data';
import { mockCalendar } from '@/lib/mock-news';

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const imp = q.get('impacts')?.split(',').filter(Boolean);
  return ok(mockCalendar().filter(e => !imp || imp.includes(e.impact)));
}
