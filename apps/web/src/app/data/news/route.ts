import { ok } from '@/lib/mock-data';
import { MOCK_NEWS } from '@/lib/mock-news';

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const cat = q.get('category'), impact = q.get('impact');
  const inc = q.get('sources')?.split(',').filter(Boolean), exc = q.get('excludeSources')?.split(',').filter(Boolean);
  const items = MOCK_NEWS.filter(n => (!cat || n.category === cat) && (!impact || n.impact === impact) && (!inc || inc.includes(n.source)) && (!exc || !exc.includes(n.source)));
  return ok({ items, nextCursor: null });
}
