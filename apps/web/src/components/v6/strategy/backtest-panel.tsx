'use client';

// Backtest beside the builder (F13): every edit re-runs a quick backtest of
// the unsaved rules (debounced), compared with a pinned baseline run. "Run and
// save" stores a run in the history (F14).
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import EquityChart from './equity-chart';
import { ApiError } from '@/lib/copy-api';
import { RANGE_PRESETS, pct, num, rangeParams, strategiesApi, tone, usd, type BacktestResult, type Metrics, type StrategyDetail, type StrategySpec } from '@/lib/strategies-api';

const ROWS: Array<{ key: keyof Metrics; label: string; fmt: (v: number | null) => string; better: 1 | -1 }> = [
  { key: 'totalReturnPct', label: 'Return', fmt: v => pct(v), better: 1 },
  { key: 'maxDrawdownPct', label: 'Max drawdown', fmt: v => pct(v), better: 1 },
  { key: 'trades', label: 'Trades', fmt: v => (v == null ? '—' : String(v)), better: 1 },
  { key: 'winRatePct', label: 'Win rate', fmt: v => (v == null ? '—' : `${v.toFixed(0)}%`), better: 1 },
  { key: 'profitFactor', label: 'Profit factor', fmt: v => num(v), better: 1 },
  { key: 'sharpe', label: 'Sharpe', fmt: v => num(v), better: 1 },
  { key: 'expectancyR', label: 'Expectancy', fmt: v => (v == null ? '—' : `${v.toFixed(2)}R`), better: 1 },
  { key: 'fees', label: 'Fees', fmt: v => usd(v), better: -1 },
];

export function MetricGrid({ m, base, testId }: { m: Metrics; base?: Metrics | null; testId?: string }) {
  return (
    <div className="sb-metrics" data-testid={testId}>
      {ROWS.map(r => {
        const v = m[r.key] as number | null;
        const b = base ? (base[r.key] as number | null) : null;
        const d = v != null && b != null ? v - b : null;
        return (
          <div key={r.key} className="sb-metric">
            <span className="x-muted">{r.label}</span>
            <b className={`m ${r.key === 'totalReturnPct' ? tone(v) : r.key === 'maxDrawdownPct' ? 'neg' : ''}`}>{r.fmt(v)}</b>
            {base && d != null && Math.abs(d) > 1e-9 && <span className={`m sb-delta ${d * r.better > 0 ? 'pos' : 'neg'}`}>{d > 0 ? '▲' : '▼'} {r.key === 'trades' ? Math.abs(d) : Math.abs(d).toFixed(2)}</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function BacktestPanel({ strategy, spec, dirty, blocked, onSaved }: { strategy: StrategyDetail; spec: StrategySpec; dirty: boolean; blocked: boolean; onSaved: (s: StrategyDetail) => void }) {
  const [range, setRange] = useState<(typeof RANGE_PRESETS)[number]['id']>('90d');
  const [capital, setCapital] = useState(10_000);
  const [slip, setSlip] = useState(5);
  const [res, setRes] = useState<BacktestResult | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [saving, setSaving] = useState(false);
  const [baseline, setBaseline] = useState<BacktestResult | null>(null);
  const seq = useRef(0);
  const params = useMemo(() => rangeParams(RANGE_PRESETS.find(r => r.id === range)!.days, capital, slip), [range, capital, slip]);

  // Auto-backtest the unsaved rules, a moment after the last edit.
  useEffect(() => {
    if (blocked) { setErr('Fix the blocking issues to see a backtest.'); return; }
    const n = ++seq.current;
    setRunning(true);
    const t = setTimeout(() => {
      strategiesApi.preview(spec, params)
        .then(r => { if (n === seq.current) { setRes(r.result); setErr(null); } })
        .catch(e => { if (n === seq.current) setErr(e instanceof ApiError ? e.message : 'Backtest failed'); })
        .finally(() => { if (n === seq.current) setRunning(false); });
    }, 1200);
    return () => clearTimeout(t);
  }, [spec, params, blocked]);

  // The pinned baseline, loaded once per pin.
  useEffect(() => {
    if (!strategy.baselineBacktestId) { setBaseline(null); return; }
    strategiesApi.getBacktest(strategy.id, strategy.baselineBacktestId).then(b => setBaseline(b.result), () => setBaseline(null));
  }, [strategy.id, strategy.baselineBacktestId]);

  async function saveRun() {
    setSaving(true);
    try {
      await strategiesApi.backtest(strategy.id, params);
      onSaved(await strategiesApi.get(strategy.id));
    } catch (e) { setErr(e instanceof ApiError ? e.message : 'Could not save the run'); }
    finally { setSaving(false); }
  }
  async function pin(id: string | null) { onSaved(await strategiesApi.update(strategy.id, { baselineBacktestId: id })); }

  return (
    <section className="x-card sb-bt" aria-label="Backtest" data-testid="sb-backtest">
      <div className="x-ch"><h2>Backtest</h2>{running ? <span className="x-sub" data-testid="sb-bt-running">Running…</span> : <span className="x-sub">Updates as you edit</span>}</div>
      <div className="sb-bt-ctl">
        <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label="Range">{RANGE_PRESETS.map(r => <button key={r.id} type="button" role="radio" aria-checked={range === r.id} onClick={() => setRange(r.id)} data-testid={`sb-range-${r.id}`}>{r.label}</button>)}</div>
        <label className="sb-mini-l">Capital <input className="x-input m sb-num" type="number" min={100} value={capital} onChange={e => Number(e.target.value) >= 100 && setCapital(Number(e.target.value))} /></label>
        <label className="sb-mini-l">Slippage <input className="x-input m sb-mini" type="number" min={0} max={500} value={slip} onChange={e => Number(e.target.value) >= 0 && setSlip(Number(e.target.value))} /> bps</label>
      </div>
      {err ? <p className="cp-err" data-testid="sb-bt-error">{err}</p> : !res ? <div className="x-skel" style={{ height: 220 }} /> : (
        <div className={running ? 'sc-stale' : ''}>
          <EquityChart equity={res.equity} baseline={baseline?.equity} testId="sb-bt-equity" />
          {baseline && <p className="cp-fine sb-legend"><i className="sb-l-now" /> Current rules <i className="sb-l-base" /> Pinned baseline</p>}
          <MetricGrid m={res.metrics} base={baseline?.metrics} testId="sb-bt-metrics" />
          {res.notes.map((n, i) => <p key={i} className="cp-fine">{n}</p>)}
          <p className="cp-fine">{res.range.bars.toLocaleString('en-US')} bars · fees and {slip} bps slippage included · signals act at the next bar’s open.</p>
        </div>
      )}
      <div className="sb-bt-actions">
        <button type="button" className="x-btn x-btn--hi" onClick={() => void saveRun()} disabled={saving || dirty || blocked} title={dirty ? 'Save the strategy first' : undefined} data-testid="sb-bt-save">{saving ? 'Running…' : 'Run and save'}</button>
        {dirty && <span className="x-muted">Save your changes to keep a run.</span>}
      </div>
      {strategy.backtests.length > 0 && (
        <div className="sb-runs" data-testid="sb-runs">
          <div className="sb-runs-h">Saved runs</div>
          {strategy.backtests.slice(0, 8).map(b => (
            <div key={b.id} className={`sb-run ${b.id === strategy.baselineBacktestId ? 'on' : ''}`}>
              <span className="x-muted">v{b.version} · {new Date(b.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <span className={`m ${tone(b.metrics.totalReturnPct)}`}>{pct(b.metrics.totalReturnPct)}</span>
              <span className="m x-muted">{b.metrics.trades} trades</span>
              <Link className="x-link" href={`/strategies/${strategy.id}/backtests/${b.id}`}>Report</Link>
              {b.id === strategy.baselineBacktestId
                ? <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => void pin(null)}>Unpin</button>
                : <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => void pin(b.id)} data-testid={`sb-pin-${b.id}`}>Pin as baseline</button>}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
