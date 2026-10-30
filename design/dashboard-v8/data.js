// Shared SAMPLE data for the v8 dashboard mocks (seeded, so all three show the same account).
(function () {
  let s = 42; const rnd = () => (s = (s * 16807) % 2147483647) / 2147483647;
  const SYMS = [['XAUUSD', 1.6], ['NAS100', 1.3], ['EURUSD', .7], ['GBPJPY', 1], ['US30', 1.1], ['BTCUSD', 1.8]];
  const START = 25000, end = new Date(2026, 9, 30, 15, 0);
  const trades = []; let id = 8000100;
  for (let d = 92; d >= 0; d--) {
    const day = new Date(end); day.setDate(day.getDate() - d);
    const dow = day.getDay(); if (dow === 0 || dow === 6) continue;
    const n = Math.floor(rnd() * 4) + (rnd() < .25 ? 0 : 1);
    for (let k = 0; k < n; k++) {
      const [sym, vol] = SYMS[Math.floor(rnd() * SYMS.length)];
      const long = rnd() < .55, tue = dow === 2;
      const win = rnd() < (tue ? .42 : long ? .7 : .58);
      const pnl = Math.round((win ? (60 + rnd() * 420) : -(40 + rnd() * (tue ? 380 : 230))) * vol * 100) / 100;
      const open = new Date(day); open.setHours(7 + Math.floor(rnd() * 10), Math.floor(rnd() * 60));
      const hold = Math.round((win ? 1800 + rnd() * 14000 : 900 + rnd() * 22000));
      const close = new Date(open.getTime() + hold * 1000);
      if (close > end) continue;
      trades.push({ id: id++, sym, side: long ? 'Long' : 'Short', open, close, hold, pnl, vol: +(0.1 + rnd() * 1.4).toFixed(2), journaled: rnd() < .55 });
    }
  }
  trades.sort((a, b) => a.close - b.close);
  let eq = START, peak = START, maxDD = 0; const equity = [{ t: trades[0].open, v: START, dd: 0 }];
  for (const t of trades) { eq += t.pnl; peak = Math.max(peak, eq); const dd = (peak - eq) / peak; maxDD = Math.max(maxDD, dd); equity.push({ t: t.close, v: eq, dd }); }
  const wins = trades.filter(t => t.pnl > 0), losses = trades.filter(t => t.pnl <= 0);
  const sum = a => a.reduce((x, t) => x + t.pnl, 0);
  const daily = {}; for (const t of trades) { const k = t.close.toISOString().slice(0, 10); (daily[k] ??= { pnl: 0, n: 0 }); daily[k].pnl += t.pnl; daily[k].n++; }
  const bySym = SYMS.map(([sym]) => { const a = trades.filter(t => t.sym === sym); return { sym, n: a.length, net: sum(a), wr: a.filter(t => t.pnl > 0).length / (a.length || 1) }; }).sort((a, b) => b.net - a.net);
  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'].map((d, i) => { const a = trades.filter(t => t.close.getDay() === i + 1); return { d, n: a.length, net: sum(a) }; });
  const hold = a => a.reduce((x, t) => x + t.hold, 0) / (a.length || 1);
  window.SAMPLE = {
    START, end, trades, equity, daily, bySym, days,
    net: eq - START, equityNow: eq, maxDD, n: trades.length, winRate: wins.length / trades.length,
    pf: sum(wins) / -sum(losses), avgWin: sum(wins) / wins.length, avgLoss: sum(losses) / losses.length,
    exp: (eq - START) / trades.length, holdWin: hold(wins), holdLoss: hold(losses),
    long: { n: trades.filter(t => t.side === 'Long').length, net: sum(trades.filter(t => t.side === 'Long')) },
    short: { n: trades.filter(t => t.side === 'Short').length, net: sum(trades.filter(t => t.side === 'Short')) },
    best: Math.max(...trades.map(t => t.pnl)), worst: Math.min(...trades.map(t => t.pnl)),
  };
  const M = '−';
  window.fmt = {
    usd: (v, d = 2) => (v > 0 ? '+' : v < 0 ? M : '') + '$' + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
    money: (v, d = 2) => '$' + v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }),
    k: v => (v < 0 ? M : '') + '$' + (Math.abs(v) >= 1000 ? (Math.abs(v) / 1000).toFixed(Math.abs(v) >= 10000 ? 0 : 1) + 'k' : Math.round(Math.abs(v))),
    pct: (v, d = 1) => (v * 100).toFixed(d) + '%',
    hold: s => { const m = Math.round(s / 60); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0') + 'm'; },
    time: d => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + ' · ' + d.toTimeString().slice(0, 5),
  };
})();
