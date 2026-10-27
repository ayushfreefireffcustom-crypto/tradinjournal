// Fallback for partner links when the API isn't proxied (mock mode / local web-only):
// skip click tracking and go straight to signup with the code pre-filled. In
// production next.config rewrites /r/:code to the API before this runs.
import { NextResponse } from 'next/server';
import { PARTNERS_ENABLED } from '@/lib/features';

export async function GET(req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = PARTNERS_ENABLED && /^[A-Za-z0-9_-]{3,20}$/.test(code) ? code.toUpperCase() : null;
  return NextResponse.redirect(new URL(clean ? `/signup?ref=${clean}` : '/', req.url), 302);
}
