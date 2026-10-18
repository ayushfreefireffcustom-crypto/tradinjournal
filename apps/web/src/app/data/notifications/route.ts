import { ok } from '@/lib/mock-data';

export const dynamic = 'force-static';

// Mock-mode notification feed for the top-bar bell.
const ago = (m: number) => new Date(Date.now() - m * 60_000).toISOString();

export function GET() {
  return ok({
    unread: 2,
    items: [
      { id: 'n1', kind: 'sync', title: 'XM Global synced', body: '3 new closed positions imported.', href: '/trades', read: false, createdAt: ago(4) },
      { id: 'n2', kind: 'review', title: 'Your weekly review is ready', body: 'Longs carried the week; Tuesdays cost you most.', href: '/dashboard', read: false, createdAt: ago(180) },
      { id: 'n3', kind: 'calendar', title: 'High-impact event in 1 hour', body: 'US CPI (m/m) at 13:30 GMT.', href: '/calendar', read: true, createdAt: ago(60 * 26) },
    ],
  });
}
