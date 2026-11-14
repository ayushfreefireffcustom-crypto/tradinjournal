'use client';

// The trade-log rows: a dense table grouped by day (desktop/tablet) or
// day-grouped cards (phones). Each row: time, symbol, price-path mini chart,
// lots, R (when the view has it), P&L, hold, rule/journal chips, AI grade.
import { memo } from 'react';
import { ArrowDown, ArrowUp } from '@phosphor-icons/react';
import { tagTone } from '@/lib/desk';
import { money } from '@/lib/dashboard-v2-format';
import { clock, dayTitle, fmtHold, money2, rStr, shortDate, type TlDay, type TlRow, type TlSort } from '@/lib/tradelog-v2-api';
import { MiniPath } from './mini-path';
import { GradeBox } from './verdict';

export interface Group { day: string; rows: TlRow[] }
/** Consecutive rows on the same day (rows are already in time order). */
export function groupRows(rows: TlRow[], grouped: boolean): Group[] {
  if (!grouped) return [{ day: '', rows }];
  const out: Group[] = [];
  for (const r of rows) {
    const g = out[out.length - 1];
    if (g && g.day === r.day) g.rows.push(r); else out.push({ day: r.day, rows: [r] });
  }
  return out;
}

const tone = (v: number | null) => (v == null || v === 0 ? '' : v > 0 ? 'up' : 'dn');

function Chips({ r, max = 2 }: { r: TlRow; max?: number }) {
  const items = [
    ...r.flags.map(f => ({ k: `f-${f.key}`, label: f.short, title: f.label, cls: 'rule' })),
    // From recorded stop levels only: widened reads as a broken rule, tightened as neutral.
    ...(r.moved ? [{ k: 'moved', label: 'Moved SL', title: r.moved === 'widened' ? 'Stop widened after entry' : 'Stop tightened after entry', cls: r.moved === 'widened' ? 'rule' : '' }] : []),
    ...[...new Set([...(r.emotion ? [r.emotion] : []), ...r.tags])].map(t => ({ k: `t-${t}`, label: t, title: t, cls: tagTone(t) === 'r' ? 'neg' : tagTone(t) === 'g' ? 'pos' : '' })),
  ];
  if (!items.length) return r.noted ? <span className="tl-noted">Noted</span> : null;
  const shown = items.slice(0, max);
  return (
    <span className="tl-chips">
      {shown.map(i => <span key={i.k} className={`tl-chip ${i.cls}`} title={i.title}>{i.label}</span>)}
      {items.length > max && <span className="tl-chip more" title={items.slice(max).map(i => i.title).join(', ')}>+{items.length - max}</span>}
    </span>
  );
}

function Dots({ d }: { d: TlDay }) {
  return <span className="tl-dots" aria-label={`${d.wins} won, ${d.n - d.wins} lost`}>{d.results.map((x, i) => <i key={i} className={x === 'w' ? 'w' : 'l'} />)}{d.n > d.results.length && <small>+{d.n - d.results.length}</small>}</span>;
}

function DayHead({ g, d, today, cols }: { g: Group; d: TlDay | undefined; today: string; cols: { r: boolean; ai: boolean } }) {
  if (g.day === 'open') {
    return <tr className="tl-dh"><td className="c-sel" /><td colSpan={2} className="tl-dh-l"><div><b>Open positions</b><span>{g.rows.length}</span></div></td><td className="c-path" /><td className="c-lots" />{cols.r && <td className="c-r" />}<td /><td className="c-hold" /><td className="c-tags" />{cols.ai && <td />}</tr>;
  }
  return (
    <tr className="tl-dh" data-testid={`day-${g.day}`}>
      <td className="c-sel" />
      <td colSpan={2} className="tl-dh-l"><div><b>{dayTitle(g.day, today)}</b>{d && <><span>{d.n} trade{d.n === 1 ? '' : 's'} · {d.wins}W {d.n - d.wins}L</span><Dots d={d} /></>}</div></td>
      <td className="c-path" /><td className="c-lots" />{cols.r && <td className="c-r" />}
      <td className="n"><b className={`d2-n ${tone(d?.net ?? null)}`}>{d ? money2(d.net) : ''}</b></td>
      <td className="c-hold" />
      <td className="tl-dh-r c-tags" colSpan={cols.ai ? 2 : 1}>{d && cols.ai ? (d.ruleBroken ? `${d.ruleBroken} with rule broken` : 'all rules kept') : ''}</td>
    </tr>
  );
}

const Row = memo(function Row({ r, grouped, cols, accountId, sel, active, onToggle, onOpen }: {
  r: TlRow; grouped: boolean; cols: { r: boolean; ai: boolean }; accountId: string; sel: boolean; active: boolean; onToggle: (id: string) => void; onOpen: (r: TlRow) => void;
}) {
  const open = r.status === 'OPEN';
  const t = grouped ? clock(r.openTime) : `${shortDate(r.openTime)} ${clock(r.openTime)}`;
  const tip = `Opened ${shortDate(r.openTime)} ${clock(r.openTime)}${r.closeTime ? ` · closed ${shortDate(r.closeTime)} ${clock(r.closeTime)}` : ' · still open'}`;
  return (
    <tr className={`tl-row${sel ? ' sel' : ''}${active ? ' on' : ''}`} tabIndex={0} onClick={() => onOpen(r)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r); if (e.key === ' ') { e.preventDefault(); onToggle(r.id); } }}
      aria-selected={active} data-testid={`row-${r.id}`}>
      <td className="c-sel" onClick={e => e.stopPropagation()}>
        <input type="checkbox" checked={sel} onChange={() => onToggle(r.id)} aria-label={`Select ${r.symbol} ${t}`} />
      </td>
      <td className="c-time" title={tip}>{t}</td>
      <td className="c-sym"><span className="tl-sym"><b title={r.symbol}>{r.symbol}</b><span className="tl-side" title={r.side === 'LONG' ? 'Long' : 'Short'}>{r.side === 'LONG' ? 'L' : 'S'}</span></span></td>
      <td className="c-path"><MiniPath accountId={accountId} row={r} w={96} h={26} /></td>
      <td className="c-lots n">{r.volume}</td>
      {cols.r && <td className="c-r n"><b className={`d2-n ${tone(r.r)}`}>{r.r != null ? rStr(r.r) : '—'}</b></td>}
      <td className="n c-pl"><b className={`d2-n ${open ? '' : tone(r.net)}`}>{open ? 'open' : money2(r.net)}</b></td>
      <td className="n c-hold">{open ? '—' : fmtHold(r.holdSecs)}</td>
      <td className="c-tags"><Chips r={r} max={3} /></td>
      {cols.ai && <td className="c-ai"><GradeBox grade={r.grade} title={r.grade ? `Process grade ${r.grade}${r.flags.length ? `: ${r.flags.map(f => f.label).join(', ')}` : ': every rule kept'}` : open ? 'Graded once closed' : undefined} /></td>}
    </tr>
  );
});

function SortTh({ k, label, sort, dir, onSort, className = '' }: { k: TlSort; label: string; sort: TlSort; dir: 'asc' | 'desc'; onSort: (k: TlSort) => void; className?: string }) {
  const on = sort === k;
  return (
    <th className={className} aria-sort={on ? (dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(k)} data-testid={`sort-${k}`}>{label}{on && (dir === 'asc' ? <ArrowUp size={10} /> : <ArrowDown size={10} />)}</button>
    </th>
  );
}

export function LogTable({ rows, days, grouped, useR, graded, accountId, selected, activeId, sort, dir, today, onSort, onToggle, onToggleAll, onOpen }: {
  rows: TlRow[]; days: Map<string, TlDay>; grouped: boolean; useR: boolean; graded: boolean; accountId: string;
  selected: Set<string>; activeId: string | null; sort: TlSort; dir: 'asc' | 'desc'; today: string;
  onSort: (k: TlSort) => void; onToggle: (id: string) => void; onToggleAll: () => void; onOpen: (r: TlRow) => void;
}) {
  const cols = { r: useR, ai: graded };
  const groups = groupRows(rows, grouped);
  const allSel = rows.length > 0 && rows.every(r => selected.has(r.id));
  const someSel = !allSel && rows.some(r => selected.has(r.id));
  return (
    <table className="tl-tbl" data-testid="log-table">
      <thead>
        <tr>
          <th className="c-sel"><input type="checkbox" checked={allSel} ref={el => { if (el) el.indeterminate = someSel; }} onChange={onToggleAll} aria-label="Select all loaded trades" data-testid="select-all" /></th>
          <SortTh k="time" label="Time" sort={sort} dir={dir} onSort={onSort} className="c-time" />
          <SortTh k="symbol" label="Symbol" sort={sort} dir={dir} onSort={onSort} className="c-sym" />
          <th className="c-path"><span title="Price from entry to exit; dashed lines are a stop or target that was hit">Path · SL / TP</span></th>
          <th className="c-lots n">Lots</th>
          {useR && <SortTh k="r" label="R" sort={sort} dir={dir} onSort={onSort} className="c-r n" />}
          <SortTh k="net" label="P&L" sort={sort} dir={dir} onSort={onSort} className="n c-pl" />
          <SortTh k="hold" label="Hold" sort={sort} dir={dir} onSort={onSort} className="n c-hold" />
          <th className="c-tags">Tags</th>
          {graded && <th className="c-ai"><span title="Process grade: rules kept before and at entry, not the result">AI</span></th>}
        </tr>
      </thead>
      {groups.map(g => (
        <tbody key={g.day || 'all'} className="tl-grp">
          {grouped && <DayHead g={g} d={days.get(g.day)} today={today} cols={cols} />}
          {g.rows.map(r => <Row key={r.id} r={r} grouped={grouped} cols={cols} accountId={accountId} sel={selected.has(r.id)} active={activeId === r.id} onToggle={onToggle} onOpen={onOpen} />)}
        </tbody>
      ))}
    </table>
  );
}

export function LogCards({ rows, days, grouped, accountId, activeId, today, onOpen }: {
  rows: TlRow[]; days: Map<string, TlDay>; grouped: boolean; accountId: string; activeId: string | null; today: string; onOpen: (r: TlRow) => void;
}) {
  return (
    <div className="tl-cards" data-testid="log-cards">
      {groupRows(rows, grouped).map(g => {
        const d = days.get(g.day);
        return (
          <section key={g.day || 'all'} className="tl-cgrp">
            {grouped && (
              <header className="tl-cgh">
                <span><b>{dayTitle(g.day, today)}</b>{g.day === 'open' ? ` · ${g.rows.length}` : d ? ` · ${d.n} trade${d.n === 1 ? '' : 's'}` : ''}</span>
                {d && <b className={`d2-n ${tone(d.net)}`}>{money(d.net)}</b>}
              </header>
            )}
            {g.rows.map(r => {
              const open = r.status === 'OPEN';
              return (
                <div key={r.id} className={`tl-card d2-card${activeId === r.id ? ' on' : ''}`} role="button" tabIndex={0} onClick={() => onOpen(r)} onKeyDown={e => { if (e.key === 'Enter') onOpen(r); }} data-testid={`card-${r.id}`}>
                  <div className="tl-card-t">
                    {r.grade && <GradeBox grade={r.grade} />}
                    <b className="tl-card-sym" title={r.symbol}>{r.symbol}</b>
                    <span className="tl-side">{r.side === 'LONG' ? 'L' : 'S'}</span>
                    <span className="tl-card-time">{grouped ? clock(r.openTime) : `${shortDate(r.openTime)} ${clock(r.openTime)}`}{!open && r.holdSecs != null ? ` · ${fmtHold(r.holdSecs)}` : ''}</span>
                    <b className={`d2-n tl-card-pl ${open ? '' : tone(r.net)}`}>{open ? 'open' : money(r.net)}</b>
                  </div>
                  {!open && (
                    <div className="tl-card-m">
                      <MiniPath accountId={accountId} row={r} h={30} fluid />
                      {r.r != null && <b className={`d2-n ${tone(r.r)}`}>{rStr(r.r)}</b>}
                    </div>
                  )}
                  <Chips r={r} max={3} />
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
