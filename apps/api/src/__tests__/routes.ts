// Every route the Express app registers, read from its router stack, with
// path params filled in. Used by the access-control matrix (Z1).
import type { Express } from 'express';

export interface RouteInfo { method: string; path: string; template: string }

type Layer = { name: string; regexp: RegExp; route?: { path: string; methods: Record<string, boolean> }; handle: { stack?: Layer[] }; keys?: Array<{ name: string }> };

/** "/^\/api\/strategies\/?(?=\/|$)/i" → "/api/strategies" (Express 4 mount regexps). */
function mountPath(l: Layer): string {
  let s = l.regexp.source;
  if (s === '^\\/?$' || s === '^\\/?(?=\\/|$)') return '';
  s = s.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\/\?\$$/, '').replace(/\(\?:\\\/\(\[\^\\\/\]\+\?\)\)/g, '/:param');
  return s.replace(/\\\//g, '/').replace(/\\-/g, '-').replace(/\\\./g, '.');
}

export function listRoutes(app: Express): RouteInfo[] {
  const out: RouteInfo[] = [];
  const walk = (stack: Layer[], prefix: string) => {
    for (const l of stack) {
      if (l.route) {
        for (const m of Object.keys(l.route.methods)) {
          if (!['get', 'post', 'put', 'patch', 'delete'].includes(m)) continue;
          const template = `${prefix}${l.route.path}`.replace(/(.)\/$/, '$1'); // "/api/journal/" → "/api/journal"
          out.push({ method: m.toUpperCase(), template, path: template.replace(/:(\w+)(\([^)]*\))?\??/g, (_x, name: string, alt?: string) => (alt ? alt.slice(1, -1).split('|')[0]! : name === 'symbol' ? 'C-BTC-100-010101' : `zz${name}`)) });
        }
      } else if (l.name === 'router' && l.handle.stack) {
        walk(l.handle.stack, prefix + mountPath(l));
      }
    }
  };
  const app4 = app as unknown as { _router: { stack: Layer[] } };
  walk(app4._router.stack, '');
  // One entry per method + path.
  const seen = new Set<string>();
  return out.filter((r) => { const k = `${r.method} ${r.template}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
