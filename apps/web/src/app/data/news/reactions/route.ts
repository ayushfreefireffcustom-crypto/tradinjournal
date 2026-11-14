import { ok } from '@/lib/mock-data';
import { mockReactions } from '@/lib/mock-news-map';

export function GET() {
  return ok(mockReactions());
}
