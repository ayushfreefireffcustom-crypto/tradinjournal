import { ok } from '@/lib/mock-data';
import { mockPartnerLinks } from '@/lib/mock-partner';
import type { PartnerChannel } from '@/lib/partner-api';
export function GET() { return ok(mockPartnerLinks()); }
export async function POST(req: Request) {
  const b = await req.json().catch(() => ({}));
  const label = String(b.label ?? '').trim().slice(0, 40) || 'New channel';
  const links = mockPartnerLinks();
  const slug = label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'channel';
  const ch: PartnerChannel = { id: `ch${Date.now()}`, label, slug, url: `${links.baseUrl}?ch=${slug}`, clicks: 0, signups: 0, connected: 0, active: 0, createdAt: new Date().toISOString() };
  links.channels.push(ch);
  return ok(ch);
}
