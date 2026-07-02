import { listJournal, createJournal, ok } from '@/lib/mock-data';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const accountId = url.searchParams.get('accountId') ?? undefined;
  return ok(listJournal(accountId));
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return ok(createJournal(body));
}
