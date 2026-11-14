'use client';

// Risk ruler (E): entry / stop / target (typed here or dragged on the chart),
// risk as % of your real balance or a fixed amount, and the size that risks
// exactly that, rounded down to the lot step. Day risk vs a 2% cap, the next
// red event, "Save as plan" (journal), "Copy levels" (clipboard), "Alert at".
import { useEffect, useState } from 'react';
import { Bell, Check, Clock, Copy } from '@phosphor-icons/react';
import { fmtGap, money, px, type RiskInput, type Sizing } from './trade-math';

export interface DayRisk { realised: number; open: number; openKnown: boolean; cap: number }

interface Props {
  symbol: string;
  side: 'LONG' | 'SHORT';
  onSide: (s: 'LONG' | 'SHORT') => void;
  entry: number | null;
  stop: number | null;
  target: number | null;
  onLevels: (v: { entry?: number | null; stop?: number | null; target?: number | null }) => void;
  risk: RiskInput;
  onRisk: (r: RiskInput) => void;
  balance: { value: number; ccy: string; label: string } | null;
  sizing: Sizing | null;
  problem: string | null;
  unit: string;
  lotDecimals: number;
  basis: string | null;
  dayRisk: DayRisk | null;
  nextEvent: { label: string; at: number } | null;
  alert: { state: 'idle' | 'busy' | 'done' | 'error'; message?: string };
  onAlert: () => void;
  save: { state: 'idle' | 'busy' | 'done' | 'error'; message?: string };
  onSave: () => void;
  onCopy: () => Promise<boolean>;
  decimals: number;
}

function PriceField({ label, value, onChange, tone, testId, decimals }: { label: string; value: number | null; onChange: (v: number | null) => void; tone?: 'pos' | 'neg'; testId: string; decimals: number }) {
  const show = (v: number | null) => (v == null ? '' : v.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }));
  const [text, setText] = useState(show(value));
  const [focus, setFocus] = useState(false);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { if (!focus) setText(show(value)); }, [value, focus, decimals]);
  return (
    <label className="tl-in">
      <span>{label}</span>
      <input className={`m ${tone ?? ''}`} inputMode="decimal" value={text} data-testid={testId} aria-label={label}
        onFocus={() => setFocus(true)} onBlur={() => setFocus(false)}
        onChange={e => { setText(e.target.value); const n = Number(e.target.value.replace(/,/g, '')); onChange(e.target.value.trim() && Number.isFinite(n) && n > 0 ? n : null); }} />
    </label>
  );
}

const PCTS = [0.25, 0.5, 1];

export default function RiskRuler(p: Props) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t); }, []);
  const [copied, setCopied] = useState<null | boolean>(null);
  const [usdText, setUsdText] = useState(p.risk.mode === 'usd' ? String(p.risk.usd) : '');
  const ccy = p.balance?.ccy ?? 'USD';
  const d = p.dayRisk;
  const mine = p.sizing && !p.sizing.belowMin ? p.sizing.riskMoney : 0;
  const total = d ? d.realised + d.open + mine : 0;
  const bal = p.balance?.value ?? null;
  const pct = (v: number) => (bal ? (v / bal) * 100 : 0);
  const capPct = bal && d ? (d.cap / bal) * 100 : 2;
  const seg = (v: number) => `${Math.max(0, Math.min(100, (v / (d?.cap || 1)) * 100))}%`;
  const ready = !!p.sizing && !p.problem;

  return (
    <section className="tl-card tl-w" aria-label="Risk ruler" data-testid="risk-ruler">
      <header className="tl-wh">
        <h2>Risk ruler</h2>
        {p.balance && <span className="tl-st mny" title={p.balance.label}>· {money(p.balance.value, ccy)}</span>}
        <div className="tl-r">
          <div className="tl-seg" role="group" aria-label="Direction">
            {(['LONG', 'SHORT'] as const).map(s => <button key={s} type="button" aria-pressed={p.side === s} onClick={() => p.onSide(s)} data-testid={`ruler-${s.toLowerCase()}`}>{s === 'LONG' ? 'Long' : 'Short'}</button>)}
          </div>
        </div>
      </header>
      <div className="tl-wb">
        <div className="tl-rin">
          <PriceField label="Entry" value={p.entry} onChange={v => p.onLevels({ entry: v })} testId="ruler-entry" decimals={p.decimals} />
          <PriceField label="Stop" value={p.stop} onChange={v => p.onLevels({ stop: v })} tone="neg" testId="ruler-stop" decimals={p.decimals} />
          <PriceField label="Target" value={p.target} onChange={v => p.onLevels({ target: v })} tone="pos" testId="ruler-target" decimals={p.decimals} />
        </div>
        <div className="tl-rrow">
          <span className="tl-lbl">Risk</span>
          <div className="tl-seg" role="group" aria-label="Risk per trade">
            {PCTS.map(v => <button key={v} type="button" aria-pressed={p.risk.mode === 'pct' && p.risk.pct === v} disabled={!bal} onClick={() => p.onRisk({ mode: 'pct', pct: v })}>{v}%</button>)}
            <button type="button" aria-pressed={p.risk.mode === 'usd'} onClick={() => p.onRisk({ mode: 'usd', usd: Number(usdText) > 0 ? Number(usdText) : p.sizing?.budget ? Math.round(p.sizing.budget) : 100 })} aria-label="Fixed amount">{ccy === 'USD' ? '$' : ccy}</button>
          </div>
        </div>
        {p.risk.mode === 'usd' && (
          <label className="tl-in tl-in-usd"><span>Risk amount ({ccy})</span>
            <input className="m" inputMode="decimal" value={usdText || String(p.risk.usd)} data-testid="ruler-usd"
              onChange={e => { setUsdText(e.target.value); const n = Number(e.target.value); if (n > 0) p.onRisk({ mode: 'usd', usd: n }); }} />
          </label>
        )}
        <div className="tl-rout" data-testid="ruler-out">
          {p.problem ? <p className="tl-hint">{p.problem}</p> : p.sizing ? (
            <>
              <div><span className="tl-n34">{p.sizing.lots.toFixed(p.lotDecimals)}</span> <span className="tl-unit">{p.unit}</span></div>
              <div className="tl-ro2">
                <span className="neg mny">{money(-p.sizing.riskMoney, ccy)}</span>
                {p.sizing.rewardMoney != null && <span className="pos mny">{money(p.sizing.rewardMoney, ccy, true)}{p.sizing.r != null ? ` · ${p.sizing.r.toFixed(1)}R` : ''}</span>}
              </div>
            </>
          ) : <p className="tl-hint">Set a stop to size the trade.</p>}
        </div>
        {p.sizing?.belowMin && <p className="tl-hint neg">That risk is below the smallest size. The minimum would risk more than you asked.</p>}
        {p.basis && <p className="tl-basis">{p.basis}</p>}
        {d && bal ? (
          <>
            <div className="tl-db" aria-hidden>
              <i style={{ width: seg(d.realised), background: 'var(--r)' }} />
              <i style={{ width: seg(d.open), background: 'var(--r)', opacity: 0.5 }} />
              <i style={{ width: seg(mine), background: 'var(--tx)' }} />
            </div>
            <div className="tl-dbl"><span className="tl-lbl">Day risk{d.openKnown ? '' : ' (open trades without a stop not counted)'}</span><span><b className="m">{pct(total).toFixed(1)}%</b> <span className="tl-lbl">of {capPct.toFixed(1)}% cap</span></span></div>
          </>
        ) : null}
        <div className="tl-rch">
          {p.nextEvent && p.nextEvent.at > now && <span className="tl-chip"><Clock size={12} aria-hidden />{p.nextEvent.label} in {fmtGap((p.nextEvent.at - now) / 60_000)}</span>}
          {p.entry != null && (
            <button type="button" className="tl-chip" onClick={p.onAlert} disabled={p.alert.state === 'busy' || p.alert.state === 'done'} data-testid="ruler-alert" title={p.alert.message}>
              {p.alert.state === 'done' ? <Check size={12} aria-hidden /> : <Bell size={12} aria-hidden />}
              {p.alert.state === 'done' ? `Alert set at ${px(p.entry)}` : p.alert.state === 'error' ? 'Alert failed, retry' : `Alert at ${px(p.entry)}`}
            </button>
          )}
        </div>
        {(p.save.state === 'error' || p.save.state === 'done') && p.save.message && <p className={`tl-hint ${p.save.state === 'error' ? 'neg' : ''}`} role="status">{p.save.message}</p>}
        <div className="tl-rbt">
          <button type="button" className="tl-btn" disabled={!ready || p.save.state === 'busy'} onClick={p.onSave} data-testid="ruler-save">{p.save.state === 'busy' ? 'Saving' : p.save.state === 'done' ? 'Saved' : 'Save as plan'}</button>
          <button type="button" className="tl-btn2" disabled={p.entry == null || p.stop == null} data-testid="ruler-copy"
            onClick={async () => { const ok = await p.onCopy(); setCopied(ok); setTimeout(() => setCopied(null), 2000); }}>
            {copied ? <Check size={14} aria-hidden /> : <Copy size={14} aria-hidden />}{copied === true ? 'Copied' : copied === false ? 'Copy failed' : 'Copy levels'}
          </button>
        </div>
      </div>
    </section>
  );
}
