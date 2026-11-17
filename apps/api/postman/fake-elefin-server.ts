// A stand-in for Elefin's Partner API for the end-to-end run (run-elefin.sh), on a port:
//   pnpm --filter api exec tsx postman/fake-elefin-server.ts 8997
// The API under test points ELEFIN_PARTNER_API_URL at http://127.0.0.1:8997/api/v1.
// Behaviour is the test fake's (fake-elefin.ts: envelope, paging, lookup, 401/403/429,
// per-key IP allow-list). A control API, for the runner only, sets it up and changes it:
//   POST /__control/reset                         empty book, partners #23 and #99
//   POST /__control/key    { key, secret, allowedIps?, hideAbilities?, partnerId? }
//   POST /__control/client { email, status?, deposits?, lots?, partnerId? }
//   POST /__control/seed   { n, partnerId? }
//   POST /__control/status { email, status }      changes a client "now" (updated_from)
//   POST /__control/key-active { key, active }    switch a key off / on at "Elefin"
//   POST /__control/key-ips { key, allowedIps }   change the key's IP allow-list ([] = any)
//   GET  /__stats                                 requests by path (no emails, no keys)
import { createServer, type IncomingMessage } from 'http';
import { FakeElefin, type FakeClient } from '../src/modules/partners/ib/elefin/__tests__/fake-elefin.js';

const port = Number(process.argv[2] ?? 8997);
const fake = new FakeElefin();

function reset(): void {
  fake.keys.clear();
  fake.clients.length = 0;
  fake.log.length = 0;
  fake.resetRateWindows();
  fake.partners = new Map([[23, 'shashwat verma'], [99, 'Another IB']]);
  fake.tradesFrom = '2026-07-21T00:00:00Z';
}
reset();

const body = (req: IncomingMessage): Promise<Record<string, unknown>> => new Promise((res, rej) => {
  let s = '';
  req.on('data', c => { s += c; });
  req.on('end', () => { try { res(s ? JSON.parse(s) : {}); } catch (e) { rej(e); } });
});

const handle = (fake as unknown as { handle: (req: IncomingMessage, res: import('http').ServerResponse) => void }).handle.bind(fake);

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  const send = (status: number, data: unknown) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data)); };
  if (url.pathname === '/__stats') {
    const byPath: Record<string, number> = {};
    for (const l of fake.log) byPath[`${l.path} ${l.status}`] = (byPath[`${l.path} ${l.status}`] ?? 0) + 1;
    send(200, { requests: fake.log.length, byPath, clients: fake.clients.length, keys: fake.keys.size });
    return;
  }
  if (!url.pathname.startsWith('/__control/')) { handle(req, res); return; }
  if (req.method !== 'POST') { send(405, {}); return; }
  try {
    const b = await body(req);
    switch (url.pathname.slice('/__control/'.length)) {
      case 'reset': reset(); send(200, { ok: true }); return;
      case 'key': {
        fake.addKey({
          key: String(b.key), secret: String(b.secret), name: String(b.name ?? 'Shash IB'), partnerId: Number(b.partnerId ?? 23),
          abilities: ['clients.read'], hideAbilities: b.hideAbilities !== false,
          allowedIps: Array.isArray(b.allowedIps) ? b.allowedIps.map(String) : undefined,
        });
        send(200, { ok: true });
        return;
      }
      case 'client': {
        const deposits = Number(b.deposits ?? 0);
        const c = fake.add({
          email: String(b.email), status: (b.status as FakeClient['status']) ?? 'active', partnerId: Number(b.partnerId ?? 23),
          registered_at: new Date(Date.now() - 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
          funding: { currency: 'USD', deposits, first_deposit_at: deposits ? '2026-11-10T00:00:00Z' : null, is_funded: deposits > 0 },
          trading: { lots: Number(b.lots ?? 0), last_trade_at: Number(b.lots ?? 0) > 0 ? '2026-11-16T09:00:00Z' : null },
        });
        send(200, { client_id: c.client_id });
        return;
      }
      case 'seed': fake.seed(Number(b.n ?? 10), Number(b.partnerId ?? 23)); send(200, { ok: true, clients: fake.clients.length }); return;
      case 'status': {
        const c = fake.clients.find(x => x.email === b.email);
        if (!c) { send(404, { error: 'no such client' }); return; }
        fake.touch(c, x => { x.status = b.status as FakeClient['status']; });
        send(200, { ok: true });
        return;
      }
      case 'key-ips': {
        const k = fake.keys.get(String(b.key));
        if (!k) { send(404, { error: 'no such key' }); return; }
        k.allowedIps = Array.isArray(b.allowedIps) && b.allowedIps.length ? b.allowedIps.map(String) : undefined;
        send(200, { ok: true });
        return;
      }
      case 'key-active': {
        const k = fake.keys.get(String(b.key));
        if (!k) { send(404, { error: 'no such key' }); return; }
        k.active = b.active !== false;
        send(200, { ok: true });
        return;
      }
      default: send(404, { error: 'unknown control' });
    }
  } catch (e) { send(400, { error: String(e) }); }
}).listen(port, '127.0.0.1', () => console.log(`fake Elefin on http://127.0.0.1:${port}/api/v1`));
