// Shared Next route handler for the partner mock: /data/<path> → handlePartnerMock.
import { handlePartnerMock } from '@/lib/mock-partner';

type Ctx = { params: Promise<{ path?: string[] }> };
export function partnerMockRoute(prefix: string[]) {
  const run = async (req: Request, { params }: Ctx) => {
    const { path = [] } = await params;
    const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await req.json().catch(() => ({}));
    const out = handlePartnerMock(req.method, [...prefix, ...path], new URL(req.url).searchParams, body);
    return out.status === 204 ? new Response(null, { status: 204 }) : Response.json(out.body, { status: out.status });
  };
  return { GET: run, POST: run, DELETE: run };
}
