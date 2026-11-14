'use client';

// Trade review blocks: KPI ribbon, grade + "what I would have done", similar
// trades, same symbol/side by hour, and the executions with the P&L breakdown.
// Pure presentation over TradeReviewDTO plus the candle maths from the page.
import Link from '@/components/v6/ui/link';
import { Check, X } from '@phosphor-icons/react';
import { useWidth } from '@/components/dashboard-v2/ui';
import { heldFor } from '@/components/charts/trade-math';
import { axisMoney, kmoney, money, pct, scale, ticks } from '@/lib/dashboard-v2-format';
import type { CandleWhatIf, Excursion, ProcessGrade, ReviewDealDTO, SameSetupDTO, SimilarDTO, TradeReviewDTO, WhatIfDTO } from '@/lib/trade-review-api';

const tone = (v: number) => (v > 0 ? 'up' : v < 0 ? 'dn' : '');
export const gradeTone = (g: ProcessGrade) => (g === 'A' || g === 'B' ? 'up' : g === 'C' ? 'mid' : 'dn');
const hm = (ms: number) => new Date(ms).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
const hh = (h: number) => `${String(h >= 24 ? 24 : Math.floor(h) % 24).padStart(2, '0')}:00`;

// ─── KPI ribbon ─────────────────────────────────────────────────────────────

export function ReviewKpis({ r, price, ex }: { r: TradeReviewDTO; price: (v: number) => string; ex: Excursion | null }) {
  const t = r.trade;
  const closed = t.status === 'CLOSED';
  const open = new Date(t.openTime).getTime();
  const close = t.closeTime ? new Date(t.closeTime).getTime() : null;
  const pctBal = r.balanceAtOpen ? t.net / r.balanceAtOpen : null;
  const cells: Array<{ k: string; v: React.ReactNode; s?: React.ReactNode; tone?: string; id: string }> = [
    {
      id: 'result', k: closed ? 'Result' : 'Floating',
      v: closed ? money(t.net, { dec: 2 }) : '—', tone: closed ? tone(t.net) : '',
      s: closed ? (r.risk ? `${t.net / r.risk.amount >= 0 ? '+' : '−'}${Math.abs(t.net / r.risk.amount).toFixed(2)}R` : pctBal != null ? `${pctBal >= 0 ? '+' : '−'}${Math.abs(pctBal * 100).toFixed(2)}% of balance` : `gross ${money(t.gross, { dec: 2 })}`) : 'still open',
    },
    {
      id: 'size', k: 'Size', v: <>{t.volume.toLocaleString('en-US', { maximumFractionDigits: 2 })}<small> lots</small></>,
      s: r.size.ratio != null ? <span className={r.size.ratio > 1.5 ? 'dn' : ''}>{r.size.ratio.toFixed(1)}× usual</span> : 'no usual size yet',
    },
    ...(r.risk ? [{ id: 'risk', k: 'At risk', v: money(r.risk.amount, { plus: false }), s: r.balanceAtOpen ? `${pct(r.risk.amount / r.balanceAtOpen, 1)} of account` : 'from your stop' }] : []),
    { id: 'entry', k: 'Entry', v: price(t.entry), s: hm(open) },
    {
      id: 'exit', k: 'Exit', v: t.exit != null ? price(t.exit) : '—',
      s: close != null ? `${hm(close)}${r.exitReason === 'sl' ? ' · at stop' : r.exitReason === 'tp' ? ' · at target' : r.exitReason === 'stopout' ? ' · stop-out' : ''}` : 'open',
    },
    ...(r.stop != null ? [{ id: 'stop', k: 'Stop set', v: price(r.stop), s: 'from your R' }] : []),
    { id: 'held', k: 'Held', v: t.durationSecs != null ? heldFor(t.durationSecs * 1000) : heldFor(Date.now() - open), s: ex?.bestMoney != null && closed ? <>best <span className="up">{money(ex.bestMoney)}</span></> : r.holdMedianSec ? `usual ${heldFor(r.holdMedianSec * 1000)}` : (closed ? '' : 'so far') },
    { id: 'fees', k: 'Fees', v: money(t.commission + t.swap, { dec: 2 }), s: `comm ${money(t.commission, { dec: 2, plus: false })} · swap ${money(t.swap, { dec: 2 })}` },
  ];
  return (
    <section className="d2-card trv-kr" data-testid="review-kpis" style={{ ['--n' as string]: cells.length }}>
      {cells.map(c => (
        <div key={c.id} data-testid={`kpi-${c.id}`}>
          <span className="d2-cap">{c.k}</span>
          <b className={`d2-n ${c.tone ?? ''}`}>{c.v}</b>
          {c.s ? <small>{c.s}</small> : <small>&nbsp;</small>}
        </div>
      ))}
    </section>
  );
}

// ─── grade + what I would have done ─────────────────────────────────────────

export function GradeBlock({ r }: { r: TradeReviewDTO }) {
  const g = r.grade;
  if (!g) {
    return (
      <div className="d2-empty trv-nograde" data-testid="grade-none">
        <b>Grade needs {r.minTrades} closed trades</b>
        <span>This account has {r.closedTrades}. Grades compare each trade with your own history, so they start once there is enough of it.</span>
      </div>
    );
  }
  const chips = g.flags.slice(0, 3);
  return (
    <div data-testid="grade-block">
      <div className="trv-gw">
        <span className={`trv-gl ${gradeTone(g.grade)}`} data-testid="grade-letter" aria-label={`Process grade ${g.grade}`}>{g.grade}</span>
        <div className="trv-chips" data-ai>
          {chips.length ? chips.map(f => <span key={f.key} className="trv-chip dn" title={f.detail}>{f.label}</span>)
            : <span className="trv-chip up">No rule broken</span>}
          {g.flags.length > 3 && <span className="trv-more">+{g.flags.length - 3} more</span>}
        </div>
      </div>
      <div className="trv-subg" role="list" aria-label="Checks">
        {([['discipline', 'Discipline'], ['risk', 'Risk'], ['timing', 'Timing']] as const).map(([k, l]) => (
          <div key={k} role="listitem" className={g.checks[k] ? 'up' : 'dn'} title={CHECK_HELP[k]}>
            {g.checks[k] ? <Check size={20} weight="bold" aria-hidden /> : <X size={20} weight="bold" aria-hidden />}
            <small>{l}</small>
            <span className="sr-only">{g.checks[k] ? 'kept' : 'broken'}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
const CHECK_HELP = {
  discipline: 'Not after 2 losses that day, not within 15 min of a loss',
  risk: 'No more than 1.5× your usual size on this symbol, no loss past −1.25R',
  timing: 'Opened in a UTC hour that is net positive for you',
};

export type LadderRow = (WhatIfDTO | CandleWhatIf) & { candle?: boolean };

export function WhatIfLadder({ rows }: { rows: LadderRow[] }) {
  if (rows.length < 2) return null;
  const max = Math.max(1, ...rows.map(r => Math.abs(r.net)));
  return (
    <div className="trv-ladder" data-testid="what-if">
      <div className="d2-cap">What I would have done</div>
      {rows.map((r, i) => (
        <div key={r.key} className={`trv-lr${i ? '' : ' me'}`} data-testid={`what-if-${r.key}`} title={r.note}>
          <b className="trv-lk">{r.label}</b>
          <span className="trv-lb">{Math.abs(r.net) < 0.005 ? <em className="z" /> : <i className={r.net < 0 ? 'dn' : 'up'} style={{ width: `${Math.max(2, (Math.abs(r.net) / max) * 100)}%` }} />}</span>
          <span className="trv-lv">
            <b className={`d2-n ${tone(r.net)}`}>{money(r.net)}</b>
            {i > 0 && Math.abs(r.delta) >= 0.5 && <small className={r.delta > 0 ? 'up' : 'dn'}>{r.delta > 0 ? `saves ${money(r.delta, { plus: false })}` : `costs ${money(-r.delta, { plus: false })}`}</small>}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── similar trades ─────────────────────────────────────────────────────────

export function SimilarBars({ s, me, href }: { s: SimilarDTO; me: { net: number; closed: boolean }; href: (id: string) => string }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const items = [...s.trades.map(t => ({ ...t, me: false })), ...(me.closed ? [{ positionId: '', symbol: '', side: 'LONG' as const, openTime: '', net: me.net, me: true }] : [])];
  const H = 200, PT = 22, PB = 36;
  const vals = items.map(i => i.net);
  const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
  // Room for the value labels above positive and below negative bars.
  const Y = scale(lo === hi ? -1 : lo, hi === lo ? 1 : hi, H - PB - (lo < 0 ? 16 : 0), PT + (hi > 0 ? 0 : -8));
  const gap = w / Math.max(1, items.length);
  const bw = Math.max(4, Math.min(26, gap - 10));
  const showVals = gap >= 34;
  const anySym = s.criteria[0] === 'Any symbol';
  const fd = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <div ref={ref} className="trv-sim" data-testid="similar-chart">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`${s.n} similar trades, ${s.wins} won, net ${money(s.net)}`}>
          <line x1={0} x2={w} y1={Y(0)} y2={Y(0)} className="trv-zero" />
          {items.map((t, i) => {
            const cx = gap * i + gap / 2;
            const y0 = Y(0), y1 = Y(t.net);
            const top = Math.min(y0, y1), h = Math.max(1, Math.abs(y1 - y0));
            const bar = <rect x={cx - bw / 2} y={top} width={bw} height={h} rx={2} className={`${t.net < 0 ? 'dn' : 'up'}${t.me ? ' me' : ''}`} />;
            const showX = gap >= 40 || i % 2 === items.length % 2 || t.me;
            return (
              <g key={t.me ? 'me' : t.positionId}>
                {t.me ? bar : <Link href={href(t.positionId)} aria-label={`${t.symbol} ${fd(t.openTime)}: ${money(t.net)}`}>{bar}</Link>}
                {(showVals || t.me) && <text x={cx} y={t.net < 0 ? y1 + 13 : y1 - 5} textAnchor="middle" className={`trv-bv ${t.me ? 'me' : t.net < 0 ? 'dn' : 'up'}`}>{axisMoney(t.net)}</text>}
                {showX && <text x={cx} y={H - 20} textAnchor="middle" className={`trv-ax${t.me ? ' me' : ''}`}>{t.me ? 'This' : fd(t.openTime)}</text>}
                {showX && anySym && !t.me && gap >= 40 && <text x={cx} y={H - 6} textAnchor="middle" className="trv-ax">{t.symbol.slice(0, 7)}</text>}
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

// ─── same symbol + side by hour ─────────────────────────────────────────────

export function SameSetupChart({ s, me }: { s: SameSetupDTO; me: { net: number; closed: boolean } }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const H = 200, PT = 12, PB = 22, AX = 46;
  const hours = [...s.points.map(p => p.hour), s.hour];
  const h0 = Math.max(0, Math.floor(Math.min(...hours)) - 1), h1 = Math.min(24, Math.ceil(Math.max(...hours)) + 1);
  const vals = [...s.points.map(p => p.net), me.closed ? me.net : 0, 0];
  const lo = Math.min(...vals), hi = Math.max(...vals);
  const Y = scale(lo - (hi - lo) * 0.08 || -1, hi + (hi - lo) * 0.08 || 1, H - PB, PT);
  const X = scale(h0, h1, 18, Math.max(60, w - AX));
  const step = (h1 - h0) > 12 || w < 420 ? (w < 340 ? 6 : 3) : 2;
  const xt: number[] = [];
  for (let h = Math.ceil(h0 / step) * step; h <= h1; h += step) xt.push(h);
  const yt = ticks(lo, hi, 3);
  const hr = Math.floor(s.hour);
  return (
    <div ref={ref} className="trv-sim" data-testid="same-setup-chart">
      {w > 0 && (
        <svg width={w} height={H} role="img" aria-label={`${s.symbol} ${s.side === 'LONG' ? 'longs' : 'shorts'} by UTC hour`}>
          <rect x={X(hr)} y={PT - 4} width={Math.max(2, X(hr + 1) - X(hr))} height={H - PB - PT + 4} className="trv-hourband" />
          <line x1={0} x2={w - AX} y1={Y(0)} y2={Y(0)} className="trv-zero" />
          {yt.map(v => <text key={v} x={w} y={Y(v) + 4} textAnchor="end" className="trv-ax">{v === 0 ? '$0' : axisMoney(v)}</text>)}
          {s.points.map(p => (
            <g key={p.positionId} className={p.net > 0 ? 'up' : 'dn'}>
              <line x1={X(p.hour)} x2={X(p.hour)} y1={Y(0)} y2={Y(p.net)} className="trv-stem" />
              <circle cx={X(p.hour)} cy={Y(p.net)} r={3} className="trv-dot" />
            </g>
          ))}
          {me.closed && (
            <g className={`me ${me.net > 0 ? 'up' : 'dn'}`} data-testid="same-setup-me">
              <line x1={X(s.hour)} x2={X(s.hour)} y1={Y(0)} y2={Y(me.net)} className="trv-stem" />
              <circle cx={X(s.hour)} cy={Y(me.net)} r={5} className="trv-dot" />
              <text x={X(s.hour) + (X(s.hour) > (w - AX) * 0.7 ? -9 : 9)} y={Y(me.net) + 4} textAnchor={X(s.hour) > (w - AX) * 0.7 ? 'end' : 'start'} className="trv-lbl">this trade</text>
            </g>
          )}
          {xt.map(h => <text key={h} x={X(h)} y={H - 5} textAnchor="middle" className="trv-ax">{hh(h)}</text>)}
        </svg>
      )}
    </div>
  );
}

export function SameSetupHead({ s }: { s: SameSetupDTO }) {
  const hr = Math.floor(s.hour);
  return (
    <div className="trv-sh">
      <span className={tone(s.inHour.net)}>{s.inHour.n ? <>{hh(hr)} UTC: {s.inHour.n} trade{s.inHour.n === 1 ? '' : 's'} · {kmoney(s.inHour.net)}</> : <>{hh(hr)} UTC: no others yet</>}</span>
      <span className={tone(s.other.net)}>Other hours: {s.other.n} · {kmoney(s.other.net)}</span>
    </div>
  );
}

// ─── executions + P&L ───────────────────────────────────────────────────────

const ENTRY: Record<ReviewDealDTO['entry'], string> = { IN: 'In', OUT: 'Out', INOUT: 'In/out', OUT_BY: 'Out by' };

export function Executions({ r, price }: { r: TradeReviewDTO; price: (v: number) => string }) {
  const t = r.trade;
  const deals = t.deals;
  const dt = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <div className="trv-ex">
      <dl className="trv-pl" data-testid="pnl-breakdown">
        <div><dt>Gross</dt><dd className={`d2-n ${tone(t.gross)}`}>{t.status === 'CLOSED' ? money(t.gross, { dec: 2 }) : '—'}</dd></div>
        <div><dt>Commission</dt><dd className="d2-n">{money(t.commission, { dec: 2 })}</dd></div>
        <div><dt>Swap</dt><dd className="d2-n">{money(t.swap, { dec: 2 })}</dd></div>
        <div className="net"><dt>Net</dt><dd className={`d2-n ${tone(t.net)}`}>{t.status === 'CLOSED' ? money(t.net, { dec: 2 }) : '—'}</dd></div>
        {r.balanceAtOpen != null && t.status === 'CLOSED' && <div><dt>Of balance</dt><dd className={`d2-n ${tone(t.net)}`}>{`${t.net < 0 ? '−' : '+'}${Math.abs((t.net / r.balanceAtOpen) * 100).toFixed(2)}%`}</dd></div>}
      </dl>
      {deals.length === 0 ? <p className="trv-muted">No fills on file for this position.</p> : (
        <>
          <div className="trv-dtw">
            <table className="d2-dt" data-testid="deals-table">
              <thead><tr><th>Deal</th><th>Time</th><th>Type</th><th>Entry</th><th>Volume</th><th>Price</th><th>Profit</th><th>Comm.</th></tr></thead>
              <tbody>
                {deals.map(d => {
                  const noPnl = d.entry === 'IN' && !d.profit;
                  return (
                    <tr key={d.ticket}>
                      <td>#{d.ticket}</td><td>{dt(d.time)}</td>
                      <td><b>{d.type === 'BUY' ? 'Buy' : d.type === 'SELL' ? 'Sell' : 'Balance'}</b></td><td>{ENTRY[d.entry]}</td>
                      <td>{d.volume.toFixed(2)}</td><td>{price(d.price)}</td>
                      <td>{noPnl ? '—' : <b className={tone(d.profit)}>{money(d.profit, { dec: 2 })}</b>}</td>
                      <td>{d.commission ? money(d.commission, { dec: 2 }) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="trv-dcards" data-testid="deals-cards">
            {deals.map(d => {
              const noPnl = d.entry === 'IN' && !d.profit;
              return (
                <div key={d.ticket} className="trv-dcard">
                  <div><b>{d.type === 'BUY' ? 'Buy' : d.type === 'SELL' ? 'Sell' : 'Balance'} · {ENTRY[d.entry].toLowerCase()}</b><small>#{d.ticket} · {d.volume.toFixed(2)} @ {price(d.price)} · {dt(d.time)}</small></div>
                  <div className="r"><b className={`d2-n ${noPnl ? '' : tone(d.profit)}`}>{noPnl ? '—' : money(d.profit, { dec: 2 })}</b>{d.commission ? <small>comm. {money(d.commission, { dec: 2 })}</small> : null}</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
