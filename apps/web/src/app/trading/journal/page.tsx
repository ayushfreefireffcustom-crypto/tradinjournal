'use client';

// Exchange journal (D17, D18): trade history imported from an exchange account,
// rebuilt into round trips, with the journal's analytics and a note, tags and
// an emotion on each trade, just like MT5 trades.
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, Modal, ago, useLoad } from '@/components/v6/copy/parts';
import { TripAnalytics } from '@/components/v6/copy/leader-analytics';
import { EmotionChips, TagEditor, tagClass, tagLabel } from '@/components/v6/journal/chips';
import { api } from '@/lib/api';
import { ApiError, exchangesApi, historyApi, price, RANGE_LABEL, signedUsd, toneOf, type JournalTrade, type LeaderRange } from '@/lib/copy-api';
import '@/styles/v6/copy.css';

const EMOTIONS = ['Disciplined', 'Confident', 'Patient', 'FOMO', 'Revenge', 'Hesitant'];
const when = (iso: string) => new Date(iso).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const hold = (a: string, b: string) => {
  const s = Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 1000);
  return s < 3600 ? `${Math.max(1, Math.round(s / 60))}m` : s < 86400 ? `${(s / 3600).toFixed(1)}h` : `${(s / 86400).toFixed(1)}d`;
};

export default function ExchangeJournalPage() {
  const toast = useToast();
  const accounts = useLoad(() => exchangesApi.list(), []);
  const [connectionId, setConnectionId] = useState('');
  const [range, setRange] = useState<LeaderRange>('30d');
  const [days, setDays] = useState(90);
  const [importing, setImporting] = useState(false);
  const [editing, setEditing] = useState<JournalTrade | null>(null);
  useEffect(() => { if (!connectionId && accounts.data?.[0]) setConnectionId(accounts.data[0].id); }, [accounts.data, connectionId]);
  const journal = useLoad(() => (connectionId ? historyApi.journal(connectionId) : Promise.resolve(null)), [connectionId]);
  const j = journal.data;
  const trips = useMemo(() => (j ? { trades: j.trades, startingEquityUsd: j.startingEquityUsd } : null), [j]);
  const newestFirst = useMemo(() => [...(j?.trades ?? [])].reverse(), [j]);

  async function runImport() {
    setImporting(true);
    try {
      const r = await historyApi.importNow(connectionId, j?.historySyncedAt ? undefined : days);
      toast.success(r.message);
      await journal.reload();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  }

  return (
    <AppShell legacy={false} pageTitle="Exchange journal" pageSubtitle="Your exchange trades, with the journal's analytics and notes"
      actions={
        <div className="x-seg" role="tablist" aria-label="Range">
          {(['7d', '30d', 'all'] as LeaderRange[]).map(r => <button key={r} role="tab" aria-selected={range === r} onClick={() => setRange(r)}>{RANGE_LABEL[r]}</button>)}
        </div>
      }>
      <div className="x-page" data-testid="xj-page">
        <section className="x-card xj-bar" aria-label="Account and import">
          <div className="x-field">
            <label htmlFor="xj-acct">Account</label>
            <select id="xj-acct" className="x-input" value={connectionId} onChange={e => setConnectionId(e.target.value)} data-testid="xj-account">
              {(accounts.data ?? []).map(c => <option key={c.id} value={c.id}>{c.label}{c.environment === 'TESTNET' ? ' (testnet)' : ''}</option>)}
            </select>
          </div>
          <div className="xj-sync" data-testid="xj-sync">
            {j ? (j.historySyncedAt
              ? <>Imported up to <b>{ago(j.historySyncedAt)}</b> · {j.fillCount} {j.fillCount === 1 ? 'fill' : 'fills'}{j.firstFillAt ? ` since ${new Date(j.firstFillAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}. New fills arrive on their own every 15 minutes.</>
              : <>Not imported yet. Choose how far back to start:</>) : null}
          </div>
          {j && !j.historySyncedAt && (
            <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Backfill">
              {[30, 90, 365].map(d => <button key={d} type="button" role="radio" aria-checked={days === d} onClick={() => setDays(d)}>{d === 365 ? '1 year' : `${d} days`}</button>)}
            </div>
          )}
          <button className="x-btn x-btn--hi" onClick={() => void runImport()} disabled={!connectionId || importing} data-testid="xj-import">{importing ? 'Importing…' : j?.historySyncedAt ? 'Import new fills' : 'Import history'}</button>
        </section>

        {accounts.data && !accounts.data.length ? (
          <div className="x-card x-empty"><b>No exchange accounts</b><p><Link className="x-link" href="/exchanges">Connect an exchange account</Link> to journal its trades.</p></div>
        ) : journal.error ? <ErrorCard message={journal.error} onRetry={journal.reload} /> : (
          <>
            <TripAnalytics trips={trips} range={range} testId="xj-empty"
              empty={j?.historySyncedAt ? 'No round trip has closed in the imported history yet. Positions still open, or opened before the import window, show up once they close.' : 'Import this account’s history to see its trades here.'} />
            {newestFirst.length > 0 && (
              <section className="x-card" aria-label="Trades">
                <div className="x-ch"><h2>Trades</h2><span className="x-sub">price P&amp;L before fees and funding · add a note to any trade</span></div>
                <div className="x-tblwrap">
                  <table className="x-tbl trd-tbl" data-testid="xj-trades">
                    <thead><tr><th>Closed</th><th>Contract</th><th>Side</th><th className="n">Size</th><th className="n">Entry</th><th className="n">Exit</th><th className="n">Held</th><th className="n">P&amp;L</th><th>Journal</th><th /></tr></thead>
                    <tbody>
                      {newestFirst.map(t => (
                        <tr key={t.key} data-testid={`xj-trade-${t.key}`}>
                          <td>{when(t.closedAt)}</td>
                          <td><b>{t.symbol}</b></td>
                          <td><span className={`x-side x-side--${t.side === 'LONG' ? 'long' : 'short'}`}>{t.side === 'LONG' ? 'Long' : 'Short'}</span></td>
                          <td className="n m">{t.qty}</td>
                          <td className="n m">{price(t.avgEntry)}</td>
                          <td className="n m">{price(t.avgExit)}</td>
                          <td className="n m">{hold(t.openedAt, t.closedAt)}</td>
                          <td className={`n m ${toneOf(t.pnlUsd)}`}>{signedUsd(t.pnlUsd)}</td>
                          <td className="xj-note">
                            {t.note ? <>
                              {t.note.emotion && <span className="x-tag">{t.note.emotion}</span>}
                              {t.note.tags.slice(0, 3).map(g => <span key={g} className={tagClass(g)}>{tagLabel(g)}</span>)}
                              {t.note.body && <small title={t.note.body}>{t.note.body}</small>}
                            </> : <span className="x-dim">—</span>}
                          </td>
                          <td className="trd-acts"><button className="x-btn x-btn--sm" onClick={() => setEditing(t)} data-testid={`xj-note-${t.key}`}>{t.note ? 'Edit note' : 'Add note'}</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
      {editing && <NoteDialog t={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); void journal.reload(); }} />}
    </AppShell>
  );
}

function NoteDialog({ t, onClose, onSaved }: { t: JournalTrade; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const [body, setBody] = useState(t.note?.body ?? '');
  const [emotion, setEmotion] = useState(t.note?.emotion ?? '');
  const [tags, setTags] = useState<string[]>(t.note?.tags ?? []);
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const commitTag = () => {
    const v = (draft ?? '').trim().toLowerCase().replace(/^#/, '').replace(/\s+/g, '-');
    if (v && !tags.includes(v) && tags.length < 30) setTags([...tags, v]);
    setDraft(null);
  };
  async function save() {
    setBusy(true);
    try {
      const payload = { body: body.trim(), emotion: emotion || undefined, tags };
      if (t.note) await api.journal.update(t.note.id, { ...payload, emotion: emotion || '' });
      else await api.journal.create({ ...payload, tradeId: t.key, title: `${t.side === 'LONG' ? 'Long' : 'Short'} ${t.symbol}`, entryDate: t.closedAt });
      toast.success('Note saved');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
      setBusy(false);
    }
  }
  return (
    <Modal title={`${t.side === 'LONG' ? 'Long' : 'Short'} ${t.qty} ${t.symbol}`} sub={`${when(t.openedAt)} → ${when(t.closedAt)} · ${signedUsd(t.pnlUsd)}`} onClose={onClose} busy={busy} testId="xj-note-dialog"
      footer={<><button className="x-btn x-btn--ghost" onClick={onClose} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void save()} disabled={busy || (!body.trim() && !emotion && !tags.length)} data-testid="xj-note-save">{busy ? 'Saving…' : 'Save'}</button></>}>
      <div className="x-field">
        <label htmlFor="xj-body">What happened, and what you&rsquo;d do again</label>
        <textarea id="xj-body" className="x-input xj-text" rows={5} value={body} onChange={e => setBody(e.target.value.slice(0, 50_000))} data-testid="xj-note-body" />
      </div>
      <div className="x-field"><label>How you felt</label><EmotionChips options={EMOTIONS} value={emotion} onChange={setEmotion} /></div>
      <div className="x-field"><label>Tags</label><TagEditor tags={tags} onRemove={g => setTags(tags.filter(x => x !== g))} draft={draft} setDraft={setDraft} onCommit={commitTag} placeholder="Add a tag" /></div>
    </Modal>
  );
}
