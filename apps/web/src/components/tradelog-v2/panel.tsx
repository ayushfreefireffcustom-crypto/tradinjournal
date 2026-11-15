'use client';

// Side panel for one trade (inline on wide screens, a drawer on tablets, a
// full-screen sheet on phones): compact chart, fills, stop and target (with the
// inline editor), process grade with its reasons, similar trades, the journal
// note, and a link to the full review.
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, NotePencil, X } from '@phosphor-icons/react';
import { fmtPrice } from '@/lib/desk';
import { tone as toneOf } from '@/lib/dashboard-v2-format';
import { clock, dayTitle, fmtHold, money2, rStr, tradelogApi, type TlRow, type TradelogTradeDTO } from '@/lib/tradelog-v2-api';
import { TradeChart } from './trade-chart';
import { GradeVerdict, SimilarStat } from './verdict';
import StopLevels from '@/components/trade-review/stop-levels';

const EXIT_WORD = { tp: 'take-profit', sl: 'stop-loss', stopout: 'stop-out', other: '' } as const;

export function TradePanel({ accountId, row, tz, minTrades, onClose, mode }: {
  accountId: string; row: TlRow; tz?: string; minTrades: number; onClose: () => void; mode: 'inline' | 'drawer';
}) {
  const [d, setD] = useState<{ id: string; data: TradelogTradeDTO | null; error: string }>({ id: '', data: null, error: '' });
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const ctl = new AbortController();
    setD({ id: row.id, data: null, error: '' });
    tradelogApi.trade(accountId, row.id, tz, ctl.signal)
      .then(data => setD({ id: row.id, data, error: '' }))
      .catch(e => { if (!ctl.signal.aborted) setD({ id: row.id, data: null, error: e instanceof Error ? e.message : 'Could not load this trade' }); });
    return () => ctl.abort();
  }, [accountId, row.id, tz]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { if (mode === 'drawer') box.current?.focus(); }, [mode, row.id]);

  const data = d.id === row.id ? d.data : null;
  const r = data?.row ?? row;
  const tone = toneOf(r.net);
  const note = data?.note;
  const exitWord = r.exitReason ? EXIT_WORD[r.exitReason] : '';
  const pctBal = data?.balanceBefore && data.balanceBefore > 0 ? (r.net / data.balanceBefore) * 100 : null;

  return (
    <aside ref={box} tabIndex={-1} className={`tl-panel d2-card ${mode}`} aria-label={`${r.symbol} ${r.side === 'LONG' ? 'long' : 'short'} trade`} data-testid="trade-panel">
      <header className="tl-ph">
        <div className="tl-ph-l">
          <h2>{r.symbol} {r.side === 'LONG' ? 'long' : 'short'}<span> · {clock(r.openTime)}</span></h2>
          <small>{r.closeTime ? dayTitle(r.day) : 'Open'} · #{r.id}{r.holdSecs != null ? ` · ${fmtHold(r.holdSecs)}` : ''}</small>
        </div>
        <div className="tl-ph-r">
          <b className={`tl-ph-pl ${tone}`}>{r.status === 'OPEN' ? 'Open' : money2(r.net)}</b>
          <small>{r.r != null ? rStr(r.r) : pctBal != null ? `${pctBal >= 0 ? '+' : '−'}${Math.abs(pctBal).toFixed(2)}% of balance` : ''}</small>
        </div>
        <button type="button" className="tl-x" onClick={onClose} aria-label="Close trade panel" data-testid="panel-close"><X size={16} /></button>
      </header>

      <div className="tl-pb">
        <TradeChart accountId={accountId} trade={{ positionId: r.id, symbol: r.symbol, side: r.side, openTime: r.openTime, closeTime: r.closeTime, entry: r.entry, exit: r.exit, sl: r.sl, tp: r.tp, net: r.net }} />

        <dl className="tl-fills">
          <div><dt>Entry</dt><dd>{fmtPrice(r.entry, r.exit)}</dd></div>
          <div><dt>Exit</dt><dd>{r.exit != null ? fmtPrice(r.exit, r.entry) : '—'}{exitWord && <small>{exitWord}</small>}</dd></div>
          <div><dt>{r.tp != null ? 'Target' : 'Stop'}</dt><dd>{r.sl != null ? fmtPrice(r.sl, r.entry) : r.tp != null ? fmtPrice(r.tp, r.entry) : data?.levels?.stop != null ? fmtPrice(data.levels.stop, r.entry) : <span className="tl-muted" title="MT5 history only keeps the stop when it was hit">not stored</span>}</dd></div>
          <div><dt>Lots</dt><dd>{r.volume}</dd></div>
        </dl>

        {d.error && d.id === row.id ? (
          <div className="tl-perr" role="alert">{d.error}</div>
        ) : !data ? (
          <div className="tl-pload" aria-busy><i className="x-skel x-skel--in" style={{ height: 64 }} /><i className="x-skel x-skel--in" style={{ height: 40 }} /></div>
        ) : (
          <>
            <StopLevels variant="panel" accountId={accountId} positionId={r.id} side={r.side} entry={r.entry} levels={data.levels}
              price={v => fmtPrice(v, r.entry)} onChange={levels => setD(p => (p.id === row.id && p.data ? { ...p, data: { ...p.data, levels } } : p))} />
            <GradeVerdict grade={r.grade} reasons={data.reasons} graded={data.graded} minTrades={minTrades} />
            <SimilarStat similar={data.similar} />
            <section className="tl-note" data-testid="panel-note">
              <h3>Journal</h3>
              {note && (note.body.trim() || note.tags.length || note.emotion) ? (
                <>
                  {note.body.trim() && <p>{note.body.trim().slice(0, 400)}{note.body.trim().length > 400 ? '…' : ''}</p>}
                  {(note.emotion || note.tags.length > 0) && <div className="tl-chips">{[...(note.emotion ? [note.emotion] : []), ...note.tags].map(t => <span key={t} className="tl-chip">{t}</span>)}</div>}
                </>
              ) : <p className="tl-muted">No note on this trade yet.</p>}
            </section>
          </>
        )}
      </div>

      <footer className="tl-pf">
        <Link className="x-btn" href={`/journal?trade=${encodeURIComponent(r.id)}`}><NotePencil size={15} />{note?.body.trim() ? 'Edit note' : 'Add note'}</Link>
        <Link className="x-btn x-btn--hi" href={`/trades/${encodeURIComponent(r.id)}?account=${encodeURIComponent(accountId)}`} data-testid="open-review">Open full review<ArrowRight size={15} /></Link>
      </footer>
    </aside>
  );
}
