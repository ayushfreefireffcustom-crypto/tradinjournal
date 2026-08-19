import { NextResponse, type NextRequest } from 'next/server';

// ── TEMPORARY MAINTENANCE GATE ──────────────────────────────────────────────
// The database is over its limit, so auth and data are down. While this is ON,
// every route is rewritten to the static /maintenance page WITHOUT touching the
// API or DB, so the site stays up and on-brand.
//
// TO RESTORE THE APP (once the DB is back):
//   • set  MAINTENANCE_MODE=false  in the web service env (no redeploy needed
//     if the platform reloads env), OR
//   • revert the commit that added this file.
// Default is ON so a plain deploy shows the maintenance page immediately.
const MAINTENANCE_MODE = (process.env.MAINTENANCE_MODE ?? 'true') !== 'false';

export function middleware(req: NextRequest) {
  if (!MAINTENANCE_MODE) return NextResponse.next();
  const { pathname } = req.nextUrl;
  // The maintenance page itself passes through (avoids a rewrite loop).
  if (pathname === '/maintenance') return NextResponse.next();
  return NextResponse.rewrite(new URL('/maintenance', req.url));
}

// Run on all routes except Next internals and static asset files, so the
// maintenance page's own CSS/JS/fonts/images still load.
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|json)$).*)'],
};
