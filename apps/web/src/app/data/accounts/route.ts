import { MOCK_ACCOUNTS, ok } from '@/lib/mock-data';

export const dynamic = 'force-static';

export async function GET() {
  return ok(MOCK_ACCOUNTS);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  // Pretend to connect — return a fresh fake account
  return ok({
    id: `acc-${body?.mt5Login ?? 'new'}`,
    broker: 'XM Global',
    mt5Login: String(body?.mt5Login ?? '999999'),
    server: body?.server ?? 'XMGlobal-MT5 10',
    baseCurrency: 'USD',
    marginMode: 'Hedging',
    status: 'CONNECTED',
    lastSyncAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  });
}
