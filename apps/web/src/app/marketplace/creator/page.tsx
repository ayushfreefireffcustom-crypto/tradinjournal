'use client';

// Creator programme (H2): apply, publish a strategy as a template (with the
// settings subscribers may tune, the venues it may run on live, and your own
// run as its track record), and manage what you've published. Pricing isn't
// offered while everything is free.
import Link from 'next/link';
import { useEffect, useState } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, useLoad } from '@/components/v6/copy/parts';
import { ApiError } from '@/lib/copy-api';
import { CATEGORIES, RISKS, catLabel, marketApi, pctS, type CandidateParam, type Category, type Creator, type MyTemplate, type PublishOptions, type Risk } from '@/lib/marketplace-api';
import { strategiesApi } from '@/lib/strategies-api';
import '@/styles/v6/account.css';
import '@/styles/v6/copy.css';
import '@/styles/v6/markets.css';
import '@/styles/v6/marketplace.css';

const STATUS: Record<string, [string, string]> = { pending: ['In review', ''], approved: ['Approved', 'x-tag--g'], rejected: ['Not approved', 'x-tag--r'], suspended: ['Suspended', 'x-tag--r'], published: ['Listed', 'x-tag--g'], unlisted: ['Unlisted', ''] };

function Apply({ cur, onDone }: { cur: Creator | null; onDone: (c: Creator) => void }) {
  const toast = useToast();
  const [displayName, setName] = useState(cur?.displayName ?? '');
  const [bio, setBio] = useState(cur?.bio ?? '');
  const [experience, setExp] = useState(cur?.experience ?? '');
  const [links, setLinks] = useState((cur?.links ?? []).join('\n'));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr('');
    try {
      const c = await marketApi.apply({ displayName: displayName.trim(), bio: bio.trim(), ...(experience.trim() ? { experience: experience.trim() } : {}), links: links.split(/\s+/).map((l) => l.trim()).filter(Boolean) });
      onDone(c);
      toast.success(cur?.status === 'approved' ? 'Profile saved' : 'Application sent. We’ll review it soon.');
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : 'Couldn’t send it'); }
    finally { setBusy(false); }
  }
  return (
    <form className="ac-form ac-form--wide" onSubmit={send} data-testid="mk-apply">
      <label className="x-field"><span>Name shown on your strategies</span><input className="x-input" value={displayName} maxLength={40} onChange={(e) => setName(e.target.value)} required data-testid="mk-apply-name" /></label>
      <label className="x-field"><span>How you trade</span><textarea className="x-input" rows={4} maxLength={1000} value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Markets, timeframes, how you manage risk…" required data-testid="mk-apply-bio" /><small className="x-muted">{bio.trim().length < 20 ? `${20 - bio.trim().length} more characters` : 'Shown to traders on your strategies.'}</small></label>
      <label className="x-field"><span>Experience <em className="x-muted">optional, only for the review</em></span><textarea className="x-input" rows={2} maxLength={500} value={experience} onChange={(e) => setExp(e.target.value)} data-testid="mk-apply-exp" /></label>
      <label className="x-field"><span>Links <em className="x-muted">optional, one per line (X, YouTube, a blog)</em></span><textarea className="x-input m" rows={2} value={links} onChange={(e) => setLinks(e.target.value)} placeholder="https://…" data-testid="mk-apply-links" /></label>
      {err && <p className="cp-err" data-testid="mk-apply-error">{err}</p>}
      <div><button className="x-btn x-btn--hi" disabled={busy || displayName.trim().length < 2 || bio.trim().length < 20} data-testid="mk-apply-send">{busy ? 'Sending…' : cur?.status === 'approved' ? 'Save' : 'Apply'}</button></div>
    </form>
  );
}

type Pick = CandidateParam & { on: boolean };
function Publish({ onDone }: { onDone: () => void }) {
  const toast = useToast();
  const strategies = useLoad(() => strategiesApi.list(), []);
  const [sid, setSid] = useState('');
  const [opts, setOpts] = useState<PublishOptions | null>(null);
  const [optErr, setOptErr] = useState('');
  const [name, setName] = useState('');
  const [summary, setSummary] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<Category>('trend');
  const [risk, setRisk] = useState<Risk>('medium');
  const [live, setLive] = useState(true);
  const [track, setTrack] = useState('');
  const [params, setParams] = useState<Pick[]>([]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => {
    if (!sid) { setOpts(null); return; }
    setOptErr('');
    marketApi.publishOptions(sid).then((o) => { setOpts(o); setName(o.strategy.name); setParams(o.candidates.map((c) => ({ ...c, on: false }))); setTrack(o.runs[0]?.id ?? ''); setLive(!o.liveIssues.length); }, (e: Error) => { setOpts(null); setOptErr(e.message); });
  }, [sid]);
  const choices = (strategies.data ?? []).filter((s) => s.status !== 'archived');
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!opts) return;
    setBusy(true); setErr('');
    try {
      await marketApi.publish({
        strategyId: opts.strategy.id, name: name.trim(), summary: summary.trim(), description: description.trim(), category, risk,
        exchanges: live ? [opts.strategy.venue] : [], trackDeploymentId: track || null,
        params: params.filter((p) => p.on).map((p) => ({ id: p.id, label: p.label, min: p.min, max: p.max, step: p.step })),
      });
      toast.success('Sent for review. It’s listed once approved.');
      setSid(''); setSummary(''); setDescription('');
      onDone();
    } catch (e2) { setErr(e2 instanceof ApiError ? e2.message : 'Couldn’t publish'); }
    finally { setBusy(false); }
  }
  const setP = (i: number, patch: Partial<Pick>) => setParams((ps) => ps.map((p, k) => (k === i ? { ...p, ...patch } : p)));
  return (
    <form className="ac-form ac-form--wide" onSubmit={send} data-testid="mk-publish">
      <label className="x-field"><span>Strategy</span>
        <select className="x-input" value={sid} onChange={(e) => setSid(e.target.value)} data-testid="mk-pub-strategy"><option value="">Choose one of your strategies…</option>{choices.map((s) => <option key={s.id} value={s.id} disabled={s.blockers > 0}>{s.name} · v{s.version}{s.blockers ? ' (needs fixing)' : ''}</option>)}</select>
      </label>
      {optErr && <p className="cp-err">{optErr}</p>}
      {opts && (
        <>
          <p className="x-muted mk-fine">Publishing freezes version {opts.strategy.version} ({opts.strategy.symbols.join(', ')}, {opts.strategy.interval}). Later edits don’t change it until you update it. Subscribers never see the rules.</p>
          <label className="x-field"><span>Name</span><input className="x-input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} required data-testid="mk-pub-name" /></label>
          <label className="x-field"><span>One-line summary</span><input className="x-input" value={summary} maxLength={160} onChange={(e) => setSummary(e.target.value)} placeholder="What it does, in a sentence" required data-testid="mk-pub-summary" /></label>
          <label className="x-field"><span>Description</span><textarea className="x-input" rows={5} maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="The idea, the markets it suits, when it struggles" required data-testid="mk-pub-desc" /><small className="x-muted">{description.trim().length < 30 ? `${30 - description.trim().length} more characters` : ' '}</small></label>
          <div className="mk-row2">
            <label className="x-field"><span>Style</span><select className="x-input" value={category} onChange={(e) => setCategory(e.target.value as Category)} data-testid="mk-pub-cat">{CATEGORIES.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
            <label className="x-field"><span>Risk</span><select className="x-input" value={risk} onChange={(e) => setRisk(e.target.value as Risk)} data-testid="mk-pub-risk">{RISKS.map(([id, l]) => <option key={id} value={id}>{l}</option>)}</select></label>
          </div>
          <label className="mk-check"><input type="checkbox" checked={live} disabled={opts.liveIssues.length > 0} onChange={(e) => setLive(e.target.checked)} data-testid="mk-pub-live" /> Allow live runs on {opts.strategy.venue === 'delta_india' ? 'Delta Exchange India' : opts.strategy.venue}</label>
          {opts.liveIssues.length > 0 && <p className="x-muted mk-fine">Paper only until: {opts.liveIssues[0]}</p>}
          <label className="x-field"><span>Track record</span>
            <select className="x-input" value={track} onChange={(e) => setTrack(e.target.value)} data-testid="mk-pub-track"><option value="">None yet</option>{opts.runs.map((r) => <option key={r.id} value={r.id}>{r.mode === 'live' ? 'Live' : 'Paper'} run from {new Date(r.startedAt).toLocaleDateString()} (v{r.version}, {r.status})</option>)}</select>
            <small className="x-muted">Your own run of this strategy, shown with its real trades.</small>
          </label>
          <fieldset className="mk-pick" data-testid="mk-pub-params">
            <legend>Settings subscribers may change <em className="x-muted">optional, up to 8</em></legend>
            {params.map((p, i) => (
              <div key={p.id} className={`mk-pick-row ${p.on ? 'is-on' : ''}`}>
                <label className="mk-check"><input type="checkbox" checked={p.on} disabled={!p.on && params.filter((x) => x.on).length >= 8} onChange={(e) => setP(i, { on: e.target.checked })} data-testid={`mk-pub-p-${i}`} /> <span>{p.label}</span> <span className="x-muted m">now {p.value}</span></label>
                {p.on && (
                  <div className="mk-pick-edit">
                    <input className="x-input" value={p.label} maxLength={60} onChange={(e) => setP(i, { label: e.target.value })} aria-label="Label shown to subscribers" />
                    <label>from <input className="x-input m" type="number" step="any" value={p.min} onChange={(e) => setP(i, { min: Number(e.target.value) })} aria-label="Minimum" /></label>
                    <label>to <input className="x-input m" type="number" step="any" value={p.max} onChange={(e) => setP(i, { max: Number(e.target.value) })} aria-label="Maximum" /></label>
                    <label>step <input className="x-input m" type="number" step="any" value={p.step} onChange={(e) => setP(i, { step: Number(e.target.value) })} aria-label="Step" /></label>
                  </div>
                )}
              </div>
            ))}
          </fieldset>
          {err && <p className="cp-err" data-testid="mk-pub-error">{err}</p>}
          <div><button className="x-btn x-btn--hi" disabled={busy || summary.trim().length < 10 || description.trim().length < 30 || name.trim().length < 3} data-testid="mk-pub-send">{busy ? 'Running the backtest…' : 'Send for review'}</button></div>
        </>
      )}
    </form>
  );
}

function Mine({ rows, reload }: { rows: MyTemplate[]; reload: () => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  async function act(t: MyTemplate, what: 'list' | 'unlist' | 'refresh') {
    setBusy(t.id);
    try {
      if (what === 'refresh') await marketApi.update(t.id, { refreshRules: true });
      else await marketApi.listing(t.id, what === 'list');
      toast.success(what === 'refresh' ? 'Updated and sent for review' : what === 'list' ? 'Listed again' : 'Unlisted. Subscribers keep running it.');
      reload();
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'That didn’t work'); }
    finally { setBusy(null); }
  }
  if (!rows.length) return <p className="x-muted">Nothing published yet.</p>;
  return (
    <div className="mk-subs">{rows.map((t) => (
      <article key={t.id} className="x-card mk-subrow" data-testid={`mk-mine-${t.id}`}>
        <header><div><b>{t.name}</b><span className="x-muted">{catLabel(t.category)} · v{t.version} · {t.subscribers} running it</span></div><span className={`x-tag ${STATUS[t.status]?.[1] ?? ''}`} data-testid="mk-mine-status">{STATUS[t.status]?.[0] ?? t.status}</span></header>
        {t.reviewNote && <p className="cp-err">Review note: {t.reviewNote}</p>}
        <p className="x-muted mk-fine">Backtest: {t.performance?.backtest ? `${pctS(t.performance.backtest.metrics.totalReturnPct ?? null)} over ${t.performance.backtest.days} days, max drawdown ${pctS(t.performance.backtest.metrics.maxDrawdownPct ?? null)}` : t.performance?.note ?? '—'}</p>
        <div className="mk-subact">
          <Link className="x-btn x-btn--sm" href={`/marketplace/${t.id}`}>View page</Link>
          {t.status === 'published' && <button className="x-btn x-btn--sm" disabled={busy === t.id} onClick={() => void act(t, 'unlist')} data-testid="mk-mine-unlist">Unlist</button>}
          {t.status === 'unlisted' && <button className="x-btn x-btn--sm" disabled={busy === t.id} onClick={() => void act(t, 'list')} data-testid="mk-mine-list">List again</button>}
          {t.strategyId && t.status !== 'pending' && <button className="x-btn x-btn--sm x-btn--ghost" disabled={busy === t.id} onClick={() => void act(t, 'refresh')} title="Use your strategy's latest rules; goes back to review">Update rules</button>}
        </div>
      </article>
    ))}</div>
  );
}

export default function CreatorPage() {
  const creator = useLoad(() => marketApi.creator(), []);
  const mine = useLoad(() => marketApi.mine(), []);
  const c = creator.data;
  const [editing, setEditing] = useState(false);
  return (
    <AppShell legacy={false} pageTitle="Creator programme" pageSubtitle="Publish your strategies for other traders to run" actions={<Link className="x-btn" href="/marketplace">Marketplace</Link>}>
      <div className="ac-st1 mk-creator" data-testid="mk-creator-page">
        {creator.error ? <ErrorCard message={creator.error} onRetry={creator.reload} /> : creator.loading && !c ? <div className="x-skel" style={{ height: 200 }} /> : (
          <section className="x-card ac-st-card" aria-label="Your creator profile" data-testid="mk-creator-card">
            <div className="x-ch"><h2>{c ? c.displayName : 'Apply'}</h2>{c && <span className={`x-tag ${STATUS[c.status]?.[1] ?? ''}`} data-testid="mk-creator-status">{STATUS[c.status]?.[0]}</span>}{c?.status === 'approved' && !editing && <button className="x-btn x-btn--sm" onClick={() => setEditing(true)}>Edit profile</button>}</div>
            {!c || c.status === 'rejected' || editing ? (
              <>
                {!c && <p className="x-muted">Publish strategies others can run. We review each creator and each strategy before it’s listed. Subscribers see results we compute ourselves, never your rules. Everything is free for now.</p>}
                {c?.status === 'rejected' && <p className="cp-err">Not approved{c.reviewNote ? `: ${c.reviewNote}` : '.'} You can apply again.</p>}
                <Apply cur={c ?? null} onDone={(x) => { creator.setData(x); setEditing(false); }} />
              </>
            ) : c.status === 'pending' ? <p className="x-muted" data-testid="mk-creator-pending">Thanks. Your application is in review; we’ll email you when it’s done.</p>
              : c.status === 'suspended' ? <p className="cp-err">Your creator profile is suspended{c.reviewNote ? `: ${c.reviewNote}` : '.'} Email hello@tradelogs.com if you think that’s wrong.</p>
              : <p className="x-muted">{c.bio}</p>}
          </section>
        )}
        {c?.status === 'approved' && (
          <>
            <section className="x-card ac-st-card" aria-label="Publish a strategy"><div className="x-ch"><h2>Publish a strategy</h2></div><Publish onDone={() => void mine.reload()} /></section>
            <section className="x-card ac-st-card" aria-label="Your published strategies"><div className="x-ch"><h2>Your strategies in the marketplace</h2></div>{mine.data ? <Mine rows={mine.data} reload={() => void mine.reload()} /> : <div className="x-skel" style={{ height: 100 }} />}</section>
          </>
        )}
      </div>
    </AppShell>
  );
}
