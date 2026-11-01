'use client';

// Trade log table for /trades: positions grouped by the day they closed (when
// sorted by time, matching daily P&L everywhere else), sortable headers, journal
// tags, and stacked cards on phones.
import Link from 'next/link';
import type { ReactNode } from 'react';
import type { Trade } from '@/lib/api';
import { fmtHold, fmtUsd } from '@/lib/dashboard-v6';
import { dayLabel, fmtPrice, marketKind, tickerMark, type TradeNote } from '@/lib/desk';
import { SideChip } from '@/components/v6/desk';
import '@/styles/v6/trades.css';
import { EXIT_LABEL, EXIT_SHORT, exitReasonOf } from '@/lib/exit-reason';

export type SortKey = 'open' | 'net' | 'held' | 'symbol';

const hm = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};
const shortDay = (iso: string) => new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const localKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
const plTone = (v: number) => (v > 0 ? 'pos' : v < 0 ? 'neg' : '');

interface Group { key: string; date: Date | null; trades: Trade[] }

/** Consecutive runs of trades closed on the same local day (input is already sorted); open positions sit under today. */
function groupByCloseDay(trades: Trade[]): Group[] {
  const out: Group[] = [];
  for (const t of trades) {
    const c = t.closeTime ? new Date(t.closeTime) : new Date();
    const key = localKey(c);
    let g = out[out.length - 1];
    if (!g || g.key !== key) { g = { key, date: new Date(c.getFullYear(), c.getMonth(), c.getDate()), trades: [] }; out.push(g); }
    g.trades.push(t);
  }
  return out;
}

/** When the position closed ("open" while it still is), with the day when the list isn't grouped. */
const closedAt = (t: Trade, grouped: boolean) => (t.closeTime ? `${grouped ? '' : `${shortDay(t.closeTime)} · `}${hm(t.closeTime)}` : 'open');

export function pctOfBalance(v: number, balance: number | null): string {
  if (!balance || balance <= 0) return '';
  return `${v >= 0 ? '+' : '−'}${((Math.abs(v) / balance) * 100).toFixed(2)}%`;
}

export function SortIcon() {
  return <svg width="9" height="12" viewBox="0 0 9 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4.5 1v10M1.5 4l3-3 3 3M1.5 8l3 3 3-3" /></svg>;
}

function SortTh({ k, label, cur, dir, onSort, className }: { k: SortKey; label: string; cur: SortKey; dir: 'asc' | 'desc'; onSort: (k: SortKey) => void; className?: string }) {
  const active = cur === k;
  return (
    <th className={className} aria-sort={active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} data-testid={`sort-${k}`}>
        {label}
        {active
          ? <svg width="9" height="12" viewBox="0 0 9 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{dir === 'asc' ? <path d="M4.5 11V1M1.5 4l3-3 3 3" /> : <path d="M4.5 1v10M1.5 8l3 3 3-3" />}</svg>
          : <SortIcon />}
      </button>
    </th>
  );
}

function Chevron() {
  return <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>;
}

interface Props {
  rows: Trade[];
  shown: number;
  sortKey: SortKey;
  sortDir: 'asc' | 'desc';
  onSort: (k: SortKey) => void;
  notes: Map<string, TradeNote>;
  balance: number | null;
  onOpen: (t: Trade) => void;
  loading: boolean;
  empty: ReactNode;
}

export function TradeLog({ rows, shown, sortKey, sortDir, onSort, notes, balance, onOpen, loading, empty }: Props) {
  const page = rows.slice(0, shown);
  const grouped = sortKey === 'open';
  const groups: Group[] = grouped ? groupByCloseDay(page) : [{ key: 'all', date: null, trades: page }];
  const maxHold = Math.max(1, ...rows.map(t => t.durationSecs ?? 0));

  const journalCell = (t: Trade) => {
    const n = notes.get(t.positionId);
    const tags = n?.tags.length ? n.tags : (t.tags ?? []).map(l => ({ label: l, tone: 'n' as const }));
    if (tags.length) {
      return (
        <span className="tr-tags">
          {tags.slice(0, 1).map(x => <span key={x.label} className={`x-tag ${x.tone === 'g' ? 'x-tag--g' : x.tone === 'r' ? 'x-tag--r' : ''}`} title={x.label}>{x.label}</span>)}
          {tags.length > 1 && <span className="x-muted" title={tags.slice(1).map(x => x.label).join(', ')}>+{tags.length - 1}</span>}
        </span>
      );
    }
    if (n?.noted) return <span className="tr-noted">Noted</span>;
    return <Link className="x-btn x-btn--dash x-btn--sm" href={`/journal?trade=${encodeURIComponent(t.positionId)}`} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>+ Add note</Link>;
  };
  const head = (g: Group) => {
    const pnl = g.trades.reduce((s, t) => s + t.netPnl, 0);
    return <><b>{g.date ? dayLabel(g.date) : ''}</b>{g.trades.length} trade{g.trades.length === 1 ? '' : 's'} · <span className={`m ${plTone(pnl)}`}>{fmtUsd(pnl)}</span></>;
  };
  const sub = (t: Trade) => {
    const kind = marketKind(t.symbol);
    return `${kind ? `${kind} · ` : ''}${closedAt(t, grouped)}`;
  };
  const pl = (t: Trade) => (
    <span className="tr-pl"><b className={`m ${plTone(t.netPnl)}`}>{fmtUsd(t.netPnl)}</b>{pctOfBalance(t.netPnl, balance) && <small className="m">{pctOfBalance(t.netPnl, balance)}</small>}</span>
  );
  const exit = (t: Trade) => {
    if (t.status === 'OPEN') return 'open';
    const r = exitReasonOf(t);
    return <>{fmtPrice(t.exitPrice, t.entryPrice)}{r && EXIT_SHORT[r] && <span className={`tr-exit tr-exit--${r}`} title={EXIT_LABEL[r]}>{EXIT_SHORT[r]}</span>}</>;
  };
  const keyOpen = (t: Trade) => (e: React.KeyboardEvent) => { if (e.key === 'Enter') onOpen(t); };

  return (
    <>
      <div className="tr-wrap" data-testid="trades-table">
        <table className="x-tbl tr-tbl">
          <thead>
            <tr>
              <SortTh k="symbol" label="Symbol" cur={sortKey} dir={sortDir} onSort={onSort} />
              <th>Side</th>
              <th className="tr-col-px">Entry → exit</th>
              <th className="n tr-col-size">Size</th>
              <SortTh k="open" label="Opened → closed" cur={sortKey} dir={sortDir} onSort={onSort} className="tr-col-time" />
              <SortTh k="held" label="Hold" cur={sortKey} dir={sortDir} onSort={onSort} className="n" />
              <SortTh k="net" label="P&L" cur={sortKey} dir={sortDir} onSort={onSort} className="n" />
              <th>Journal</th>
              <th className="tr-col-chev" aria-label="Open" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="tr-sk">
                  <td><span className="x-sym"><span className="x-mk x-skel x-skel--in" /><i className="x-skel x-skel--in" style={{ width: 70 }} /></span></td>
                  {['', 'tr-col-px', 'tr-col-size', 'tr-col-time', '', '', '', 'tr-col-chev'].map((c, j) => <td key={j} className={c}><i className="x-skel x-skel--in" style={{ width: c === 'tr-col-chev' ? 12 : 40 + ((i + j) % 4) * 14 }} /></td>)}
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr><td colSpan={9}>{empty}</td></tr>
            ) : (
              groups.map(g => [
                ...(grouped ? [<tr key={`g-${g.key}`} className="x-grp"><td colSpan={9}>{head(g)}</td></tr>] : []),
                ...g.trades.map(t => (
                  <tr key={t.positionId} className="x-click" tabIndex={0} onClick={() => onOpen(t)} onKeyDown={keyOpen(t)} data-testid={`trade-row-${t.positionId}`}>
                    <td>
                      <span className="x-sym"><span className="x-mk">{tickerMark(t.symbol)}</span>
                        <span><b>{t.symbol}</b><small>{sub(t)}</small></span></span>
                    </td>
                    <td><SideChip dir={t.direction} /></td>
                    <td className="m tr-px tr-col-px"><b>{fmtPrice(t.entryPrice, t.exitPrice)}</b> → {exit(t)}</td>
                    <td className="n m tr-col-size">{t.volume.toFixed(2)}</td>
                    <td className="m tr-time tr-col-time"><b>{hm(t.openTime)}</b> → {t.status === 'OPEN' ? 'open' : hm(t.closeTime)}</td>
                    <td className="n"><span className="tr-hold"><i style={{ width: `${Math.max(4, ((t.durationSecs ?? 0) / maxHold) * 40)}px` }} /><span className="m">{fmtHold(t.durationSecs)}</span></span></td>
                    <td className="n">{pl(t)}</td>
                    <td>{journalCell(t)}</td>
                    <td className="tr-chev tr-col-chev"><Chevron /></td>
                  </tr>
                )),
              ])
            )}
          </tbody>
        </table>
      </div>

      <div className="tr-cards">
        {loading ? (
          Array.from({ length: 6 }).map((_, i) => <div key={i} className="x-skel x-skel--in" style={{ height: 58, margin: '10px 0', borderRadius: 12 }} />)
        ) : rows.length === 0 ? empty : groups.map(g => (
          <div key={g.key}>
            {grouped && <div className="tr-cgrp">{head(g)}</div>}
            {g.trades.map(t => (
              <div key={t.positionId} className="tr-card" role="link" tabIndex={0} onClick={() => onOpen(t)} onKeyDown={keyOpen(t)}>
                <span className="x-mk">{tickerMark(t.symbol)}</span>
                <div className="tr-card-a"><span><b>{t.symbol}</b><SideChip dir={t.direction} /></span><small>{closedAt(t, grouped)} · {fmtHold(t.durationSecs)} · {t.volume.toFixed(2)} lots</small></div>
                {pl(t)}
                <div className="tr-card-j"><span className="m tr-px">{fmtPrice(t.entryPrice, t.exitPrice)} → {exit(t)}</span>{journalCell(t)}</div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
