import { MOCK_ACCOUNTS, ok } from '@/lib/mock-data';

// Mock "Sync now": a short pause, then the account with a fresh lastSyncAt.
export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await new Promise(r => setTimeout(r, 600));
  const account = MOCK_ACCOUNTS.find(a => a.id === id) ?? MOCK_ACCOUNTS[0];
  return ok({ account: { ...account, lastSyncAt: new Date().toISOString(), lastSyncError: null }, result: 'synced' });
}
