// Market-data relay. Runs on Railway in Singapore so the API (US East, next to
// the database) can read exchanges that refuse US servers: Bybit and Binance
// futures. GET only, a fixed host allowlist, a shared token, no dependencies.
//   GET /r/<host>/<path>?<query>  → GET https://<host>/<path>?<query>
//   GET /health                   → ok
//   GET /check                    → status of one public call per host (token)
import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';

export const HOSTS = new Set(['api.bybit.com', 'fapi.binance.com', 'api.binance.com', 'api.india.delta.exchange']);
const PROBES = {
  'api.bybit.com': '/v5/market/time',
  'fapi.binance.com': '/fapi/v1/time',
  'api.binance.com': '/api/v3/time',
  'api.india.delta.exchange': '/v2/products?page_size=1',
};
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 8 * 1024 * 1024;

export function authorised(header, token) {
  if (!token || typeof header !== 'string') return false;
  const a = Buffer.from(header);
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** `/r/api.bybit.com/v5/market/tickers?category=linear` → the upstream URL, or null. */
export function target(reqUrl) {
  const u = new URL(reqUrl, 'http://relay');
  const m = /^\/r\/([^/]+)(\/.*)$/.exec(u.pathname);
  if (!m || !HOSTS.has(m[1])) return null;
  return `https://${m[1]}${m[2]}${u.search}`;
}

async function upstream(url) {
  const res = await fetch(url, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'error' });
  const body = Buffer.from(await res.arrayBuffer());
  return { status: res.status, type: res.headers.get('content-type') ?? 'application/json', body };
}

export function handler(token) {
  return async (req, res) => {
    const send = (status, body, type = 'application/json') => { res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' }); res.end(body); };
    if (req.url === '/health') return send(200, '{"ok":true}');
    if (req.method !== 'GET') return send(405, '{"error":"GET only"}');
    if (!authorised(req.headers['x-relay-token'], token)) return send(401, '{"error":"unauthorised"}');
    try {
      if (req.url === '/check') {
        const out = {};
        await Promise.all(Object.entries(PROBES).map(async ([h, p]) => {
          try { out[h] = (await upstream(`https://${h}${p}`)).status; } catch (e) { out[h] = String(e?.message ?? e); }
        }));
        return send(200, JSON.stringify(out));
      }
      const url = target(req.url);
      if (!url) return send(403, '{"error":"host not allowed"}');
      const r = await upstream(url);
      if (r.body.length > MAX_BYTES) return send(502, '{"error":"response too large"}');
      return send(r.status, r.body, r.type);
    } catch (e) {
      console.warn(`[relay] ${req.url?.split('?')[0]} failed: ${e?.message ?? e}`);
      return send(502, '{"error":"upstream failed"}');
    }
  };
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) {
  const token = process.env.RELAY_TOKEN;
  if (!token || token.length < 24) { console.error('RELAY_TOKEN (24+ characters) is required'); process.exit(1); }
  const port = Number(process.env.PORT) || 8080;
  createServer(handler(token)).listen(port, () => console.log(`relay listening on ${port}`));
}
