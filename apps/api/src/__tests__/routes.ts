// Every route the Express app registers, read from its router stack, with
// path params filled in. Used by the access-control matrix (Z1) and the
// rate-limit audit (Z2).
import type { Express } from 'express';

export interface RouteInfo {
  method: string;
  path: string;
  template: string;
  /** Rate limits in front of the route (markRateLimit names), router-level ones included. */
  limits: string[];
}

type Handle = { stack?: Layer[]; rateLimit?: string };
type Layer = { name: string; regexp: RegExp; route?: { path: string; methods: Record<string, boolean>; stack: Layer[] }; handle: Handle };

/** "/^\/api\/strategies\/?(?=\/|$)/i" → "/api/strategies" (Express 4 mount regexps). */
function mountPath(l: Layer): string {
  let s = l.regexp.source;
  if (s === '^\\/?$' || s === '^\\/?(?=\\/|$)') return '';
  s = s.replace(/^\^/, '').replace(/\\\/\?\(\?=\\\/\|\$\)$/, '').replace(/\\\/\?\$$/, '').replace(/\(\?:\\\/\(\[\^\\\/\]\+\?\)\)/g, '/:param');
  return s.replace(/\\\//g, '/').replace(/\\-/g, '-').replace(/\\\./g, '.');
}

const fill = (template: string) =>
  template.replace(/:(\w+)(\([^)]*\))?\??/g, (_x, name: string, alt?: string) => (alt ? alt.slice(1, -1).split('|')[0]! : name === 'symbol' ? 'C-BTC-100-010101' : `zz${name}`));

export function listRoutes(app: Express): RouteInfo[] {
  const out: RouteInfo[] = [];
  const walk = (stack: Layer[], prefix: string, inherited: string[]) => {
    // Middleware mounted with router.use() runs for the routes after it whose path it matches.
    const before: Layer[] = [];
    const limitsFor = (rel: string) => before.filter((b) => b.handle.rateLimit && b.regexp.test(rel)).map((b) => b.handle.rateLimit!);
    for (const l of stack) {
      if (l.route) {
        const rel = fill(l.route.path);
        const limits = [...inherited, ...limitsFor(rel), ...l.route.stack.map((h) => h.handle.rateLimit).filter((x): x is string => !!x)];
        for (const m of Object.keys(l.route.methods)) {
          if (!['get', 'post', 'put', 'patch', 'delete'].includes(m)) continue;
          const template = `${prefix}${l.route.path}`.replace(/(.)\/$/, '$1'); // "/api/journal/" → "/api/journal"
          out.push({ method: m.toUpperCase(), template, path: fill(template), limits });
        }
      } else if (l.name === 'router' && l.handle.stack) {
        const mount = mountPath(l);
        walk(l.handle.stack, prefix + mount, [...inherited, ...limitsFor(fill(mount) || '/')]);
      } else {
        before.push(l);
      }
    }
  };
  const app4 = app as unknown as { _router: { stack: Layer[] } };
  walk(app4._router.stack, '', []);
  // One entry per method + path.
  const seen = new Set<string>();
  return out.filter((r) => { const k = `${r.method} ${r.template}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
