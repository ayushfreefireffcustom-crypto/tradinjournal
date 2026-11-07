// "View as partner" (admins only): while set, partner-portal API calls carry
// ?viewAs=<partnerId> and the API answers with that partner's data, read-only.
// Kept for this browser tab only (sessionStorage).
const KEY = 'tl.viewAsPartner';
export interface ViewAs { id: string; name: string }

export function getViewAs(): ViewAs | null {
  if (typeof window === 'undefined') return null;
  try { const v = JSON.parse(sessionStorage.getItem(KEY) ?? 'null'); return v && typeof v.id === 'string' ? v : null; } catch { return null; }
}
export function setViewAs(v: ViewAs): void {
  try { sessionStorage.setItem(KEY, JSON.stringify(v)); } catch { /* private mode: the view just won't stick */ }
  window.dispatchEvent(new Event('tl:view-as'));
}
export function clearViewAs(): void {
  try { sessionStorage.removeItem(KEY); } catch { /* ignore */ }
  window.dispatchEvent(new Event('tl:view-as'));
}

/** Adds ?viewAs= to partner-portal API paths (`/api/partner/...`) while viewing as a partner. */
export function withViewAs(path: string): string {
  const v = getViewAs();
  // Only the partner pages (/partner/...) are viewed as someone else.
  if (!v || !window.location.pathname.startsWith('/partner') || !/\/(api|data)\/partner(\/|\?|$)/.test(path)) return path;
  return `${path}${path.includes('?') ? '&' : '?'}viewAs=${encodeURIComponent(v.id)}`;
}
