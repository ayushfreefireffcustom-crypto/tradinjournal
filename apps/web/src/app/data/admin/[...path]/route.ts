import { handleAdminMock } from '@/lib/mock-admin';

// Mock-mode admin API: /data/admin/<path> → lib/mock-admin.ts. Partner admin
// routes live in their own sibling folders and win over this catch-all.
type Ctx = { params: Promise<{ path: string[] }> };
async function run(req: Request, { params }: Ctx) {
  const { path } = await params;
  const body = req.method === 'GET' || req.method === 'DELETE' ? {} : await req.json().catch(() => ({}));
  const out = handleAdminMock(req.method, path, new URL(req.url).searchParams, body);
  return Response.json(out.body, { status: out.status });
}
export { run as GET, run as POST, run as DELETE };
