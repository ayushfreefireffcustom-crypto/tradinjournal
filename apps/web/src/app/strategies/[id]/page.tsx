'use client';

// Strategy builder (F2–F11, F13, F19). Two layouts over the same spec:
// Cockpit (every zone at once) and Flow (one step at a time). The read-back,
// checks and backtest update as you edit.
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import AppShell from '@/components/app-shell';
import { useToast } from '@/components/toast';
import { ErrorCard, Modal, useLoad } from '@/components/v6/copy/parts';
import BacktestPanel from '@/components/v6/strategy/backtest-panel';
import DeployDialog from '@/components/v6/strategy/deploy-dialog';
import { AdvancedZone, EntryZone, ExitZone, MarketZone, RiskZone, SessionZone, SizingZone } from '@/components/v6/strategy/zones';
import { ApiError } from '@/lib/copy-api';
import { indicatorAlertsApi } from '@/lib/indicator-alerts-api';
import { STATUS_TEXT, deploymentsApi, strategiesApi, tone, usd, type DeploymentRow, type StrategyDetail, type StrategySpec, type Validation } from '@/lib/strategies-api';
import '@/styles/v6/copy.css';
import '@/styles/v6/markets.css';

type Layout = 'cockpit' | 'flow';
const ZONES = [
  { id: 'market', title: 'Market', sub: 'What it trades and with how much leverage' },
  { id: 'session', title: 'Session', sub: 'Bar size and when it may enter' },
  { id: 'entry', title: 'Entry', sub: 'The signal to open a trade' },
  { id: 'exit', title: 'Exit', sub: 'Signals that close a trade early' },
  { id: 'risk', title: 'Risk', sub: 'Stop, target, trailing and partial exits' },
  { id: 'sizing', title: 'Sizing', sub: 'How big each trade is' },
  { id: 'advanced', title: 'Advanced and limits', sub: 'Order type, re-entry and safety limits' },
] as const;
type ZoneId = (typeof ZONES)[number]['id'];
const zoneOfPath = (p?: string): ZoneId | null => (!p ? null : p.startsWith('market') ? 'market' : p.startsWith('session') ? 'session' : p.startsWith('entry') ? 'entry' : p.startsWith('exit') ? 'exit' : p.startsWith('risk') ? 'risk' : p.startsWith('sizing') ? 'sizing' : 'advanced');

export default function StrategyBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const cat = useLoad(() => indicatorAlertsApi.catalogue(), []);
  const [strategy, setStrategy] = useState<StrategyDetail | null>(null);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [spec, setSpec] = useState<StrategySpec | null>(null);
  const [check, setCheck] = useState<{ validation: Validation; readback: string[] } | null>(null);
  const [layout, setLayout] = useState<Layout>('cockpit');
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState('');
  const [versionsOpen, setVersionsOpen] = useState(false);
  const [name, setName] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [runs, setRuns] = useState<DeploymentRow[] | null>(null);
  useEffect(() => { deploymentsApi.forStrategy(id).then(setRuns, () => setRuns([])); }, [id]);

  useEffect(() => { try { const l = localStorage.getItem('tradelogs.builder.layout'); if (l === 'flow' || l === 'cockpit') setLayout(l); } catch { /* ignore */ } }, []);
  const pickLayout = (l: Layout) => { setLayout(l); try { localStorage.setItem('tradelogs.builder.layout', l); } catch { /* ignore */ } };
  const load = (s: StrategyDetail) => { setStrategy(s); setSpec(s.spec); setName(s.name); setCheck({ validation: s.validation, readback: s.readback }); };
  useEffect(() => { strategiesApi.get(id).then(load, e => setLoadErr(e instanceof Error ? e.message : 'Could not load')); }, [id]);

  const dirty = !!strategy && !!spec && JSON.stringify(spec) !== JSON.stringify(strategy.spec);
  // Live checks and read-back.
  useEffect(() => {
    if (!spec) return;
    const t = setTimeout(() => { strategiesApi.inspect(spec).then(setCheck, () => {}); }, 350);
    return () => clearTimeout(t);
  }, [spec]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => { if (dirty) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const set = (fn: (s: StrategySpec) => StrategySpec) => setSpec(s => (s ? fn(s) : s));
  const blockers = check?.validation.blockers ?? [];
  const blockedZones = useMemo(() => new Set(blockers.map(b => zoneOfPath(b.path)).filter(Boolean)), [blockers]);

  async function save() {
    if (!strategy || !spec) return;
    setSaving(true);
    try {
      const s = await strategiesApi.update(strategy.id, { spec, ...(name.trim() && name !== strategy.name ? { name: name.trim() } : {}), ...(note.trim() ? { note: note.trim() } : {}) });
      load(s);
      setNote('');
      toast.success(s.version !== strategy.version ? `Saved as version ${s.version}` : 'Saved');
    } catch (e) { toast.error(e instanceof ApiError ? e.message : 'Could not save'); }
    finally { setSaving(false); }
  }

  if (loadErr) return <AppShell legacy={false} pageTitle="Strategy"><div className="x-page"><ErrorCard message={loadErr} /></div></AppShell>;
  if (!strategy || !spec || !cat.data) return <AppShell legacy={false} pageTitle="Strategy"><div className="x-page"><div className="x-skel" style={{ height: 480 }} /></div></AppShell>;

  const zone = (z: ZoneId): ReactNode => {
    switch (z) {
      case 'market': return <MarketZone spec={spec} set={set} />;
      case 'session': return <SessionZone spec={spec} set={set} />;
      case 'entry': return <EntryZone spec={spec} set={set} catalogue={cat.data!} />;
      case 'exit': return <ExitZone spec={spec} set={set} catalogue={cat.data!} />;
      case 'risk': return <RiskZone spec={spec} set={set} />;
      case 'sizing': return <SizingZone spec={spec} set={set} />;
      case 'advanced': return <AdvancedZone spec={spec} set={set} />;
    }
  };
  const card = (z: (typeof ZONES)[number]) => (
    <section key={z.id} className={`x-card sb-zone ${blockedZones.has(z.id) ? 'is-blocked' : ''}`} aria-label={z.title} data-testid={`sb-zone-${z.id}`}>
      <div className="sb-zone-h"><h2>{z.title}</h2><span className="x-muted">{z.sub}</span>{blockedZones.has(z.id) && <span className="x-tag x-tag--r">Needs a fix</span>}</div>
      {zone(z.id)}
    </section>
  );

  return (
    <AppShell legacy={false} pageTitle={strategy.name} pageSubtitle={`Strategy · version ${strategy.version}${strategy.source === 'ai' ? ' · made with AI' : strategy.source === 'legacy' ? ' · from SignalX strategies' : ''}`}
      actions={<>
        <Link className="x-btn" href="/strategies">All strategies</Link>
        <button className="x-btn" onClick={() => setVersionsOpen(true)} data-testid="sb-versions">Versions</button>
        <button className="x-btn" onClick={() => setDeploying(true)} disabled={dirty || blockers.length > 0} title={dirty ? 'Save first' : blockers.length ? 'Fix the blocking issues first' : undefined} data-testid="sb-run">Run</button>
        <button className="x-btn x-btn--hi" onClick={() => void save()} disabled={!dirty && name === strategy.name || saving} data-testid="sb-save">{saving ? 'Saving…' : dirty ? 'Save' : 'Saved'}</button>
      </>}>
      <div className="x-page sb-page" data-testid="sb-page">
        <div className="sb-top">
          <input className="x-input sb-name" value={name} maxLength={80} onChange={e => setName(e.target.value)} aria-label="Strategy name" data-testid="sb-name" />
          {dirty && <input className="x-input sb-note" placeholder="What changed? (optional, kept with the version)" value={note} maxLength={200} onChange={e => setNote(e.target.value)} data-testid="sb-note" />}
          <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Layout">
            <button type="button" role="radio" aria-checked={layout === 'cockpit'} onClick={() => pickLayout('cockpit')} data-testid="sb-layout-cockpit">Cockpit</button>
            <button type="button" role="radio" aria-checked={layout === 'flow'} onClick={() => pickLayout('flow')} data-testid="sb-layout-flow">Step by step</button>
          </div>
        </div>
        <div className="sb-cols">
          <div className="sb-main">
            {layout === 'cockpit' ? ZONES.map(card) : (
              <>
                <ol className="sb-steps" data-testid="sb-steps">{ZONES.map((z, k) => <li key={z.id}><button type="button" aria-current={k === step} className={blockedZones.has(z.id) ? 'is-blocked' : ''} onClick={() => setStep(k)}>{k + 1}. {z.title}</button></li>)}</ol>
                {card(ZONES[step]!)}
                <div className="sb-flow-nav">
                  <button className="x-btn" onClick={() => setStep(k => Math.max(0, k - 1))} disabled={step === 0}>Back</button>
                  {step < ZONES.length - 1 ? <button className="x-btn x-btn--hi" onClick={() => setStep(k => k + 1)} data-testid="sb-next">Next: {ZONES[step + 1]!.title}</button> : <button className="x-btn x-btn--hi" onClick={() => void save()} disabled={!dirty || saving}>Save strategy</button>}
                </div>
              </>
            )}
          </div>
          <aside className="sb-side">
            <section className="x-card" aria-label="In plain English" data-testid="sb-readback">
              <div className="x-ch"><h2>In plain English</h2></div>
              <div className="sb-rb">{(check?.readback ?? []).map((l, i) => <p key={i}>{l}</p>)}</div>
            </section>
            <section className="x-card" aria-label="Checks" data-testid="sb-checks">
              <div className="x-ch"><h2>Checks</h2>{!blockers.length && <span className="x-tag x-tag--g">Ready to backtest</span>}</div>
              {blockers.length > 0 && <div className="sb-issues"><div className="sb-issues-h neg">Blocks running</div>{blockers.map((b, i) => <p key={i} data-testid="sb-blocker">{b.message}</p>)}</div>}
              {!!check?.validation.live.length && <div className="sb-issues"><div className="sb-issues-h">Needed before going live</div>{check.validation.live.map((b, i) => <p key={i}>{b.message}</p>)}</div>}
              {!!check?.validation.warnings.length && <div className="sb-issues"><div className="sb-issues-h x-muted">Worth knowing</div>{check.validation.warnings.map((w, i) => <p key={i} data-testid="sb-warning">{w.message}</p>)}</div>}
              {!blockers.length && !check?.validation.warnings.length && !check?.validation.live.length && <p className="x-muted">Nothing to flag.</p>}
            </section>
            <BacktestPanel strategy={strategy} spec={spec} dirty={dirty} blocked={blockers.length > 0} onSaved={load} />
            {!!runs?.length && (
              <section className="x-card" aria-label="Runs" data-testid="sb-deployments">
                <div className="x-ch"><h2>Runs</h2><Link className="x-link" href="/strategies/deployments">All</Link></div>
                {runs.slice(0, 6).map(r => (
                  <Link key={r.id} href={`/strategies/deployments/${r.id}`} className="sb-run">
                    <span><span className={`x-tag ${r.mode === 'live' ? 'x-tag--r' : ''}`}>{r.mode === 'live' ? 'Live' : 'Paper'}</span> v{r.version}</span>
                    <span className="x-muted">{STATUS_TEXT[r.status]}</span>
                    <span className={`m ${tone(r.closedPnl + r.openPnl)}`}>{usd(r.closedPnl + r.openPnl)}</span>
                  </Link>
                ))}
              </section>
            )}
            <div className="sb-danger">
              <button className="x-btn x-btn--sm x-btn--ghost" onClick={async () => { const d = await strategiesApi.duplicate(strategy.id); router.push(`/strategies/${d.id}`); }} data-testid="sb-dup">Duplicate</button>
              <button className="x-btn x-btn--sm x-btn--ghost" onClick={async () => { load(await strategiesApi.update(strategy.id, { status: strategy.status === 'archived' ? 'draft' : 'archived' })); }} data-testid="sb-archive">{strategy.status === 'archived' ? 'Unarchive' : 'Archive'}</button>
            </div>
          </aside>
        </div>
      </div>
      {deploying && <DeployDialog strategy={strategy} onClose={() => setDeploying(false)} onStarted={d => router.push(`/strategies/deployments/${d.id}`)} />}
      {versionsOpen && (
        <Modal title="Versions" sub="Every saved change to the rules. Restoring makes a new version; nothing is lost." onClose={() => setVersionsOpen(false)} testId="sb-versions-dialog">
          <ul className="sb-vers">
            {strategy.versions.map(v => (
              <li key={v.version}>
                <b>Version {v.version}</b><span className="x-muted">{new Date(v.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span><span>{v.note ?? ''}</span>
                {v.version === strategy.version ? <span className="x-tag x-tag--g">Current</span> : <button className="x-btn x-btn--sm" onClick={async () => { try { load(await strategiesApi.restore(strategy.id, v.version)); setVersionsOpen(false); toast.success(`Restored version ${v.version}`); } catch (e) { toast.error(e instanceof Error ? e.message : 'Could not restore'); } }} data-testid={`sb-restore-${v.version}`}>Restore</button>}
              </li>
            ))}
          </ul>
        </Modal>
      )}
    </AppShell>
  );
}
