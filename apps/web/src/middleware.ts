import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const SKIP = ['/maintenance', '/admin', '/access', '/api', '/_next', '/favicon', '/sw.js', '/login', '/signup', '/verify', '/forgot', '/register', '/unsubscribe'];

function apiBase() {
  return process.env.API_ORIGIN || process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:4000';
}

async function fetchMaintenance(): Promise<{ enabled: boolean }> {
  try {
    const res = await fetch(`${apiBase()}/api/access/maintenance`, { next: { revalidate: 5 } });
    if (!res.ok) return { enabled: false };
    const json = await res.json();
    return { enabled: !!json?.data?.enabled };
  } catch {
    return { enabled: false };
  }
}

/** Admins must reach product routes during maintenance (API already bypasses). */
async function isAdminSession(request: NextRequest): Promise<boolean> {
  try {
    const cookie = request.headers.get('cookie');
    if (!cookie) return false;
    const res = await fetch(`${apiBase()}/api/access/status`, {
      headers: { cookie },
      cache: 'no-store',
    });
    if (!res.ok) return false;
    const json = await res.json();
    return !!json?.data?.isAdmin;
  } catch {
    return false;
  }
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (SKIP.some(p => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  const maintenance = await fetchMaintenance();
  if (maintenance.enabled && pathname !== '/maintenance') {
    if (await isAdminSession(request)) {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/maintenance', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
};
