import { ok } from '@/lib/mock-data';
import { mockNewsToday } from '@/lib/mock-news-map';

export function GET() {
  return ok(mockNewsToday());
}
