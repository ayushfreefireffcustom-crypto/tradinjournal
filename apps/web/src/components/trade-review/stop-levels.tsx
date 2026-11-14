'use client';

// Stop and target of one position: the stop at entry (what R is measured
// against) and where it came from, the latest levels, a widened / tightened
// stop, and an inline "Add stop / target" editor. Used on the trade review and
// in the trade log side panel. Hidden entirely until the levels table exists
// (levels.available === false) — nothing to show, nothing to edit.
import { useEffect, useState } from 'react';
import { PencilSimple, Plus, Trash } from '@phosphor-icons/react';
import { levelError, parsePrice, SOURCE_LABEL, tradeDataApi, type PositionLevelsDTO } from '@/lib/trade-data-api';
import './stop-levels.css';

const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

export default function StopLevels({ accountId, positionId, side, entry, levels, price, onChange, variant = 'card' }: {
  accountId: string; positionId: string; side: 'LONG' | 'SHORT'; entry: number;
  levels: PositionLevelsDTO | null | undefined;
  price: (v: number) => string;
  onChange: (l: PositionLevelsDTO) => void;
  variant?: 'card' | 'panel';
}) {
  const [editing, setEditing] = useState(false);
  const [sl, setSl] = useState('');
  const [tp, setTp] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { setEditing(false); setErr(null); }, [positionId]);
  if (!levels?.available) return null;

  const cur = levels.current;
  const open = () => { setSl(cur.sl != null ? String(cur.sl) : ''); setTp(cur.tp != null ? String(cur.tp) : ''); setErr(null); setEditing(true); };
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const s = parsePrice(sl), t = parsePrice(tp);
    if (Number.isNaN(s) || Number.isNaN(t)) { setErr('Enter a price'); return; }
    const sNew = s !== cur.sl ? s : null, tNew = t !== cur.tp ? t : null;
    if (sNew == null && tNew == null) { setEditing(false); return; }
    const problem = levelError(side, entry, sNew, tNew ?? (sNew != null ? cur.tp : null), levels.stop != null);
    if (problem) { setErr(problem); return; }
    setBusy('save'); setErr(null);
    try {
      const r = await tradeDataApi.add(accountId, positionId, { sl: sNew, tp: tNew });
      onChange(r.levels); setEditing(false);
    } catch (x) { setErr(x instanceof Error ? x.message : 'Could not save'); }
    finally { setBusy(null); }
  };
  const remove = async (id: string) => {
    setBusy(id); setErr(null);
    try { onChange((await tradeDataApi.remove(accountId, id)).levels); }
    catch (x) { setErr(x instanceof Error ? x.message : 'Could not remove it'); }
    finally { setBusy(null); }
  };

  const has = levels.stop != null || levels.target != null;
  const movedTo = levels.move && cur.sl != null && levels.stop != null && cur.sl !== levels.stop ? cur.sl : null;
  const hist = levels.history.length >= 2 || levels.history.some(h => h.mine) ? levels.history.slice(-5).reverse() : [];
  const stopLabel = side === 'LONG' ? 'below' : 'above';

  return (
    <section className={`sl sl--${variant}${variant === 'card' ? ' d2-card' : ''}`} data-testid="stop-levels" aria-label="Stop and target">
      <div className="sl-row">
        {levels.stop != null ? (
          <div className="sl-cell" data-testid="sl-stop"><span className="d2-cap">Stop at entry</span><b className="d2-n">{price(levels.stop)}</b><small>{SOURCE_LABEL[levels.stopSource ?? 'user']}</small></div>
        ) : !has ? (
          <div className="sl-cell sl-none" data-testid="sl-none"><span className="d2-cap">Stop at entry</span><b className="sl-dash">Not recorded</b><small>R needs it</small></div>
        ) : null}
        {levels.target != null && (
          <div className="sl-cell" data-testid="sl-target"><span className="d2-cap">Target</span><b className="d2-n">{price(levels.target)}</b><small>{SOURCE_LABEL[levels.targetSource ?? 'user']}</small></div>
        )}
        {levels.move && (
          <div className={`sl-cell sl-move ${levels.move === 'widened' ? 'dn' : 'up'}`} data-testid="sl-move">
            <span className="d2-cap">Stop {levels.move}</span>
            <b className="d2-n">{movedTo != null ? price(movedTo) : 'Removed'}</b>
            <small>{levels.move === 'widened' ? 'further from entry' : 'closer to entry'}</small>
          </div>
        )}
        {!editing && (
          <button type="button" className="x-btn x-btn--sm sl-edit" onClick={open} data-testid="sl-open">
            {has ? <><PencilSimple size={14} aria-hidden />Edit</> : <><Plus size={14} aria-hidden />Add stop / target</>}
          </button>
        )}
      </div>

      {editing && (
        <form className="sl-form" onSubmit={save} data-testid="sl-form" noValidate>
          <label><span className="d2-cap">{levels.stop != null ? 'Stop now' : `Stop (${stopLabel} ${price(entry)})`}</span>
            <input className="x-input m" inputMode="decimal" value={sl} onChange={e => setSl(e.target.value)} aria-label="Stop price" data-testid="sl-input" autoFocus />
          </label>
          <label><span className="d2-cap">Target</span>
            <input className="x-input m" inputMode="decimal" value={tp} onChange={e => setTp(e.target.value)} aria-label="Target price" data-testid="tp-input" />
          </label>
          <div className="sl-actions">
            <button type="submit" className="x-btn x-btn--sm x-btn--hi" disabled={busy === 'save'} data-testid="sl-save">{busy === 'save' ? 'Saving' : 'Save'}</button>
            <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => { setEditing(false); setErr(null); }}>Cancel</button>
          </div>
        </form>
      )}
      {err && <p className="sl-err" role="alert" data-testid="sl-error">{err}</p>}

      {hist.length > 0 && (
        <ol className="sl-hist" aria-label="Level history" data-testid="sl-history">
          {hist.map(h => (
            <li key={h.id}>
              <span className="m">{h.sl != null ? `SL ${price(h.sl)}` : ''}{h.sl != null && h.tp != null ? ' · ' : ''}{h.tp != null ? `TP ${price(h.tp)}` : ''}{h.sl == null && h.tp == null ? 'No stop' : ''}</span>
              <small>{SOURCE_LABEL[h.source]} · {when(h.at)}</small>
              {h.mine && (
                <button type="button" className="sl-del" onClick={() => void remove(h.id)} disabled={busy === h.id} aria-label="Remove this level" title="Remove" data-testid="sl-del">
                  <Trash size={14} aria-hidden />
                </button>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
