'use client';

// AI coach extras (H11): context chips that hand the coach more of your data
// for a question, and three tools: make a strategy, explain a chart pattern,
// and tune a strategy (shown as a before/after backtest, saved only when you
// confirm). Each tool's result is kept in the conversation.
import Link from '@/components/v6/ui/link';
import { useEffect, useState } from 'react';
import Modal from '@/components/v6/ui/modal';
import { ApiError } from '@/lib/copy-api';
import { patternsApi, type ChartPattern } from '@/lib/patterns-api';
import { INTERVALS, pct, strategiesApi, type Interval, type StrategyRow, type StrategySpec } from '@/lib/strategies-api';
import '@/styles/v6/kit.css';

const API = process.env.NEXT_PUBLIC_API_URL || '';
export type ChipId = 'positions' | 'fills7d' | 'strategies' | 'follows';
interface Chip { id: ChipId; label: string; count: number | null }

async function post<T>(path: string, body: unknown): Promise<T> {
  const r = await fetch(`${API}/api${path}`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = (await r.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!r.ok) throw new ApiError(j?.error?.message ?? `Request failed (${r.status})`, r.status);
  return j!.data as T;
}

export function ContextChips({ selected, onChange, disabled }: { selected: ChipId[]; onChange: (c: ChipId[]) => void; disabled?: boolean }) {
  const [chips, setChips] = useState<Chip[]>([]);
  useEffect(() => {
    fetch(`${API}/api/ai/context-chips`, { credentials: 'include' }).then((r) => r.json()).then((j: { data?: Chip[] }) => setChips(j.data ?? []), () => setChips([]));
  }, []);
  if (!chips.length) return null;
  return (
    <div className="ai-chips" role="group" aria-label="Add to this question" data-testid="coach-chips">
      <span className="x-muted">Include</span>
      {chips.map((c) => {
        const on = selected.includes(c.id);
        return <button key={c.id} type="button" className={`ai-chip ${on ? 'is-on' : ''}`} aria-pressed={on} disabled={disabled} onClick={() => onChange(on ? selected.filter((x) => x !== c.id) : [...selected, c.id])} data-testid={`coach-chip-${c.id}`}>{c.label}{c.count != null ? <span className="m"> {c.count}</span> : null}</button>;
      })}
    </div>
  );
}

export type ToolResult = { user: string; assistant: string };
type Tool = 'strategy' | 'pattern' | 'tune';

export function ToolsMenu({ disabled, onResult }: { disabled?: boolean; onResult: (r: ToolResult) => void }) {
  const [open, setOpen] = useState<Tool | null>(null);
  const [menu, setMenu] = useState(false);
  return (
    <>
      <div className="ai-tools">
        <button type="button" className="x-btn x-btn--sm" aria-expanded={menu} disabled={disabled} onClick={() => setMenu((m) => !m)} data-testid="coach-tools">Tools</button>
        {menu && (
          <div className="ai-tools-menu" role="menu" data-testid="coach-tools-menu">
            <button type="button" role="menuitem" onClick={() => { setOpen('strategy'); setMenu(false); }} data-testid="coach-tool-strategy"><b>Make a strategy</b><span>From an idea, ready to backtest</span></button>
            <button type="button" role="menuitem" onClick={() => { setOpen('pattern'); setMenu(false); }} data-testid="coach-tool-pattern"><b>Explain a pattern</b><span>On a market’s chart right now</span></button>
            <button type="button" role="menuitem" onClick={() => { setOpen('tune'); setMenu(false); }} data-testid="coach-tool-tune"><b>Tune a strategy</b><span>Proposed changes with a before/after backtest</span></button>
          </div>
        )}
      </div>
      {open === 'strategy' && <MakeStrategy onClose={() => setOpen(null)} onResult={onResult} />}
      {open === 'pattern' && <ExplainPattern onClose={() => setOpen(null)} onResult={onResult} />}
      {open === 'tune' && <TuneStrategy onClose={() => setOpen(null)} onResult={onResult} />}
    </>
  );
}

function MakeStrategy({ onClose, onResult }: { onClose: () => void; onResult: (r: ToolResult) => void }) {
  const [prompt, setPrompt] = useState('');
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [interval, setInterval] = useState<Interval>('1h');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function go() {
    setBusy(true); setErr('');
    try {
      const s = await strategiesApi.generate({ prompt: prompt.trim(), symbol: symbol.trim().toUpperCase(), interval });
      onResult({
        user: `Make a strategy: ${prompt.trim()} (${symbol.toUpperCase()}, ${interval})`,
        assistant: `I made **${s.name}** and saved it as a draft.\n\n${s.readback.map((l) => `- ${l}`).join('\n')}\n\n[Open it in the builder](/strategies/${s.id}) to backtest it and adjust the rules.`,
      });
      onClose();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Couldn’t make it'); setBusy(false); }
  }
  return (
    <Modal title="Make a strategy" sub="Describe the idea; it becomes rules you can backtest and edit." onClose={onClose} busy={busy} testId="coach-strategy-dialog"
      footer={<><button className="x-btn" onClick={onClose} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void go()} disabled={busy || prompt.trim().length < 10 || !/^[A-Z0-9]{2,30}$/i.test(symbol.trim())} data-testid="coach-strategy-go">{busy ? 'Making it…' : 'Make it'}</button></>}>
      <div className="ai-tool-form">
        <label className="x-field"><span>The idea</span><textarea className="x-input" rows={4} maxLength={1000} value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="Buy when RSI drops below 30 and turns up, stop under the recent low, take profit at 2R" data-testid="coach-strategy-prompt" /></label>
        <div className="ai-tool-row">
          <label className="x-field"><span>Market</span><input className="x-input m" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} data-testid="coach-strategy-symbol" /></label>
          <label className="x-field"><span>Bar size</span><select className="x-input" value={interval} onChange={(e) => setInterval(e.target.value as Interval)}>{INTERVALS.map((i) => <option key={i} value={i}>{i}</option>)}</select></label>
        </div>
        {err && <p className="cp-err" data-testid="coach-tool-error">{err}</p>}
      </div>
    </Modal>
  );
}

const TFS = ['15m', '1h', '4h', '1d'];
function ExplainPattern({ onClose, onResult }: { onClose: () => void; onResult: (r: ToolResult) => void }) {
  const [symbol, setSymbol] = useState('BTCUSDT');
  const [tf, setTf] = useState('4h');
  const [found, setFound] = useState<ChartPattern[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  async function find() {
    setBusy(true); setErr(''); setFound(null);
    try { setFound((await patternsApi.find(symbol.trim().toUpperCase(), tf)).patterns); } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn’t read the chart'); } finally { setBusy(false); }
  }
  async function explain(p: ChartPattern) {
    setBusy(true); setErr('');
    try {
      const x = await patternsApi.explain(symbol.trim().toUpperCase(), tf, p.id);
      onResult({
        user: `Explain the ${p.label.toLowerCase()} on ${symbol.toUpperCase()} ${tf}`,
        assistant: `**${p.label}** on ${symbol.toUpperCase()} ${tf} (${p.bias}, ${p.status.replace('_', ' ')}).\n\n**What it is.** ${x.whatItIs}\n\n**Why it matters.** ${x.whyItMatters}\n\n**Where it’s wrong.** ${x.whereItsWrong}\n\n**Measured move.** ${x.measuredMove}\n\n[See it on the chart](/charts)`,
      });
      onClose();
    } catch (e) { setErr(e instanceof Error ? e.message : 'Couldn’t explain it'); setBusy(false); }
  }
  return (
    <Modal title="Explain a pattern" sub="Finds the patterns on the chart now, then explains the one you pick." onClose={onClose} busy={busy} testId="coach-pattern-dialog"
      footer={<><button className="x-btn" onClick={onClose} disabled={busy}>Close</button><button className="x-btn x-btn--hi" onClick={() => void find()} disabled={busy || !/^[A-Z0-9]{2,30}$/i.test(symbol.trim())} data-testid="coach-pattern-find">{busy && !found ? 'Reading the chart…' : 'Find patterns'}</button></>}>
      <div className="ai-tool-form">
        <div className="ai-tool-row">
          <label className="x-field"><span>Market</span><input className="x-input m" value={symbol} onChange={(e) => setSymbol(e.target.value.toUpperCase())} data-testid="coach-pattern-symbol" /></label>
          <label className="x-field"><span>Timeframe</span><select className="x-input" value={tf} onChange={(e) => setTf(e.target.value)}>{TFS.map((t) => <option key={t}>{t}</option>)}</select></label>
        </div>
        {found && (found.length ? (
          <ul className="ai-tool-list" data-testid="coach-pattern-list">{found.slice(0, 12).map((p) => <li key={p.id}><button type="button" onClick={() => void explain(p)} disabled={busy}><b>{p.label}</b><span className="x-muted">{p.bias} · {p.status.replace('_', ' ')}</span></button></li>)}</ul>
        ) : <p className="x-muted" data-testid="coach-pattern-none">No clear patterns on this chart right now.</p>)}
        {err && <p className="cp-err" data-testid="coach-tool-error">{err}</p>}
      </div>
    </Modal>
  );
}

interface Tune { goal: string; changes: string[]; proposal: StrategySpec; readback: string[]; window: { days: number }; before: Record<string, number | null>; after: Record<string, number | null>; version: number }
const METRICS: Array<[string, string, (v: number | null) => string]> = [
  ['totalReturnPct', 'Return', (v) => pct(v)], ['maxDrawdownPct', 'Max drawdown', (v) => pct(v)], ['winRatePct', 'Win rate', (v) => (v == null ? '—' : `${v.toFixed(1)}%`)],
  ['profitFactor', 'Profit factor', (v) => (v == null ? '—' : v.toFixed(2))], ['trades', 'Trades', (v) => (v == null ? '—' : String(v))], ['sharpe', 'Sharpe', (v) => (v == null ? '—' : v.toFixed(2))],
];

function TuneStrategy({ onClose, onResult }: { onClose: () => void; onResult: (r: ToolResult) => void }) {
  const [list, setList] = useState<StrategyRow[] | null>(null);
  const [sid, setSid] = useState('');
  const [goal, setGoal] = useState('');
  const [t, setT] = useState<Tune | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  useEffect(() => { strategiesApi.list().then((l) => { const ok = l.filter((s) => s.status !== 'archived' && !s.blockers); setList(ok); setSid(ok[0]?.id ?? ''); }, () => setList([])); }, []);
  const name = list?.find((s) => s.id === sid)?.name ?? '';
  async function propose() {
    setBusy(true); setErr(''); setT(null);
    try { setT(await post<Tune>(`/strategies/${sid}/tune`, { goal: goal.trim() })); } catch (e) { setErr(e instanceof ApiError ? e.message : 'Couldn’t tune it'); } finally { setBusy(false); }
  }
  async function save() {
    if (!t) return;
    setBusy(true); setErr('');
    try {
      const s = await strategiesApi.update(sid, { spec: t.proposal, note: `Tuned with AI: ${t.goal}`.slice(0, 200) });
      const row = (k: string) => { const m = METRICS.find((x) => x[0] === k)!; return `| ${m[1]} | ${m[2](t.before[k] ?? null)} | ${m[2](t.after[k] ?? null)} |`; };
      onResult({
        user: `Tune ${name}: ${t.goal}`,
        assistant: `Saved as version ${s.version} of **${name}**.\n\n${t.changes.map((c) => `- ${c}`).join('\n')}\n\n| Backtest, ${t.window.days} days | Before | After |\n|---|---|---|\n${['totalReturnPct', 'maxDrawdownPct', 'winRatePct', 'trades'].map(row).join('\n')}\n\n[Open it in the builder](/strategies/${sid}). Past results don’t predict future ones.`,
      });
      onClose();
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Couldn’t save it'); setBusy(false); }
  }
  return (
    <Modal title="Tune a strategy" sub="Say what you want to improve. You’ll see the changes and a backtest of both before anything is saved." onClose={onClose} busy={busy} wide testId="coach-tune-dialog"
      footer={!t ? <><button className="x-btn" onClick={onClose} disabled={busy}>Cancel</button><button className="x-btn x-btn--hi" onClick={() => void propose()} disabled={busy || !sid || goal.trim().length < 5} data-testid="coach-tune-go">{busy ? 'Testing changes…' : 'Suggest changes'}</button></>
        : <><button className="x-btn" onClick={() => setT(null)} disabled={busy}>Try another goal</button><button className="x-btn x-btn--hi" onClick={() => void save()} disabled={busy} data-testid="coach-tune-save">{busy ? 'Saving…' : 'Save as a new version'}</button></>}>
      <div className="ai-tool-form">
        {!list ? <div className="x-skel" style={{ height: 40 }} /> : !list.length ? <p className="x-muted">No strategies ready to tune. <Link className="x-link" href="/strategies">Make one</Link> first.</p> : (
          <>
            <label className="x-field"><span>Strategy</span><select className="x-input" value={sid} onChange={(e) => { setSid(e.target.value); setT(null); }} data-testid="coach-tune-strategy">{list.map((s) => <option key={s.id} value={s.id}>{s.name} · v{s.version}</option>)}</select></label>
            <label className="x-field"><span>Goal</span><input className="x-input" value={goal} maxLength={300} onChange={(e) => setGoal(e.target.value)} placeholder="Smaller drawdowns, even if it makes a bit less" data-testid="coach-tune-goal" /></label>
          </>
        )}
        {t && (
          <div className="ai-tune" data-testid="coach-tune-result">
            <b>Proposed changes</b>
            <ul>{(t.changes.length ? t.changes : ['(no description given)']).map((c, i) => <li key={i}>{c}</li>)}</ul>
            <table className="x-tbl"><thead><tr><th>Backtest, {t.window.days} days</th><th className="r">Now</th><th className="r">With the changes</th></tr></thead>
              <tbody>{METRICS.map(([k, l, f]) => <tr key={k}><td>{l}</td><td className="r m">{f(t.before[k] ?? null)}</td><td className="r m">{f(t.after[k] ?? null)}</td></tr>)}</tbody></table>
            <p className="x-muted ai-fine2">Same window, fees and slippage for both. Saving makes version {t.version + 1}; running deployments keep their version.</p>
          </div>
        )}
        {err && <p className="cp-err" data-testid="coach-tool-error">{err}</p>}
      </div>
    </Modal>
  );
}
