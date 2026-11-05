// Fake MT5 bridge for the Postman suite: same /verify and /deals contract as
// apps/mt5-bridge, a deterministic ~3k-deal history, and a call log so tests can
// prove reads stop hitting the bridge and syncs are incremental. History is
// anchored to *now* (so clients trade "recently"); logins ending in 0 stopped
// trading 40 days ago (useful for connected-but-not-active cases).
//   node fake-bridge.mjs [port]      (default 8999)
// Test-only endpoints: GET /__stats, POST /__add (append one closed trade), POST /__reset
import { createServer } from 'http';

const port = Number(process.argv[2] ?? 8999);
const SECRET_PASSWORD = 'demo-pass';
const DAY = 86_400;

let deals = [];
let calls = { verify: 0, deals: 0, last: null };
let ticket = 50_000_000;

function seed() {
  deals = [];
  ticket = 50_000_000;
  // 1500 trades every 4h; the newest closes a few hours ago.
  const start = Math.floor(Date.now() / 1000) - 1500 * 4 * 3600;
  deals.push({ deal_ticket: ++ticket, order_ticket: 0, position_id: 0, symbol: '', type: 2, entry: 0, volume: '0', price: '0', profit: '10000.00', commission: '0', swap: '0', fee: '0', deal_time: start - DAY, comment: 'Deposit' });
  let r = 7;
  const rand = () => ((r = (r * 1103515245 + 12345) % 2147483648) / 2147483648);
  for (let i = 0; i < 1500; i++) {
    const open = start + i * 4 * 3600;
    const pos = 900_000 + i;
    const buy = rand() > 0.5;
    const sym = ['EURUSD', 'XAUUSD', 'GBPUSD', 'BTCUSD'][i % 4];
    const vol = (Math.round(rand() * 9 + 1) / 100).toFixed(2);
    const pnl = ((rand() - 0.45) * 60).toFixed(2);
    deals.push({ deal_ticket: ++ticket, order_ticket: ticket, position_id: pos, symbol: sym, type: buy ? 0 : 1, entry: 0, volume: vol, price: '1.10000', profit: '0', commission: '-0.35', swap: '0', fee: '0', deal_time: open, comment: '' });
    deals.push({ deal_ticket: ++ticket, order_ticket: ticket, position_id: pos, symbol: sym, type: buy ? 1 : 0, entry: 1, volume: vol, price: '1.10120', profit: pnl, commission: '-0.35', swap: '0', fee: '0', deal_time: open + 1800, comment: '' });
  }
}
seed();

const toEpoch = s => Math.floor(Date.parse(s + 'Z') / 1000);
const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };

createServer((req, res) => {
  let raw = '';
  req.on('data', c => (raw += c));
  req.on('end', () => {
    const body = raw ? JSON.parse(raw) : {};
    if (req.url === '/__stats') return json(res, 200, { ...calls, total: deals.length, newest: deals[deals.length - 1].deal_time });
    if (req.url === '/__reset') { seed(); calls = { verify: 0, deals: 0, last: null }; return json(res, 200, { ok: true }); }
    if (req.url === '/__add') {
      const t = deals[deals.length - 1].deal_time + 3600, pos = 990_000 + deals.length;
      deals.push({ deal_ticket: ++ticket, order_ticket: ticket, position_id: pos, symbol: 'EURUSD', type: 0, entry: 0, volume: '0.10', price: '1.1', profit: '0', commission: '-0.35', swap: '0', fee: '0', deal_time: t, comment: '' });
      deals.push({ deal_ticket: ++ticket, order_ticket: ticket, position_id: pos, symbol: 'EURUSD', type: 1, entry: 1, volume: '0.10', price: '1.102', profit: '20.00', commission: '-0.35', swap: '0', fee: '0', deal_time: t + 600, comment: '' });
      return json(res, 200, { total: deals.length });
    }
    if (body.password !== SECRET_PASSWORD) return json(res, 401, { detail: 'Authorization failed (-6)' });
    if (req.url === '/verify') {
      calls.verify++;
      return json(res, 200, { login: body.login, name: 'Fake Trader', server: body.server, currency: 'USD', balance: '10000.00', margin_mode: 'HEDGING' });
    }
    if (req.url === '/deals') {
      calls.deals++;
      calls.last = { from_time: body.from_time, to_time: body.to_time };
      const from = toEpoch(body.from_time), to = toEpoch(body.to_time);
      const quietSince = Number(body.login) % 10 === 0 ? Math.floor(Date.now() / 1000) - 40 * DAY : Infinity;
      const out = deals.filter(d => d.deal_time >= from && d.deal_time <= to && d.deal_time < quietSince);
      return json(res, 200, { deals: out, total: out.length });
    }
    json(res, 404, { detail: 'not found' });
  });
}).listen(port, '127.0.0.1', () => console.log(`fake bridge on :${port} with ${deals.length} deals`));
