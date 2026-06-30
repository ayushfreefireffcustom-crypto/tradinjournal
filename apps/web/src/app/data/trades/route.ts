import { statsFor, ok } from '@/lib/mock-data';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId') ?? '';
  const { trades } = statsFor(accountId);
  return ok(trades);
}
