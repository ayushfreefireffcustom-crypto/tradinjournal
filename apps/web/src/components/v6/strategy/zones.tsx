'use client';

// The builder's zones (F2–F8): market, session, entry, exit, risk, sizing,
// advanced and limits. Each edits one slice of the spec.
import { Plus, X } from '@phosphor-icons/react';
import { useEffect, useState, type ReactNode } from 'react';
import SymbolSearch from '@/components/charts/symbol-search';
import GroupEditor from './group-editor';
import type { CatalogueItem } from '@/lib/indicator-alerts-api';
import { INTERVALS, VENUES, emptyCondition, type Interval, type SessionWindow, type SignalGroup, type Sizing, type StrategySpec, type Venue } from '@/lib/strategies-api';
import '@/styles/v6/kit.css';
import '@/styles/v6/strategy.css';

type Set = (fn: (s: StrategySpec) => StrategySpec) => void;
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const TIMEZONES = ['UTC', 'Asia/Kolkata', 'Europe/London', 'America/New_York', 'Asia/Tokyo', 'Asia/Singapore', 'Asia/Dubai'];
const PRESETS: Array<{ label: string; w: SessionWindow }> = [
  { label: 'Tokyo', w: { days: [1, 2, 3, 4, 5], start: '00:00', end: '09:00' } },
  { label: 'London', w: { days: [1, 2, 3, 4, 5], start: '07:00', end: '16:00' } },
  { label: 'New York', w: { days: [1, 2, 3, 4, 5], start: '12:00', end: '21:00' } },
  { label: 'London–NY overlap', w: { days: [1, 2, 3, 4, 5], start: '12:00', end: '16:00' } },
];

/** A number field that keeps what's typed and reports only valid numbers. */
export function Num({ value, onChange, min, max, step, label, testId, suffix, allowEmpty, placeholder }: { value: number | null; onChange: (n: number | null) => void; min?: number; max?: number; step?: number; label: string; testId?: string; suffix?: string; allowEmpty?: boolean; placeholder?: string }) {
  const [text, setText] = useState(value == null ? '' : String(value));
  useEffect(() => { setText(value == null ? '' : String(value)); }, [value]);
  const n = Number(text);
  const bad = text.trim() === '' ? !allowEmpty : !Number.isFinite(n) || (min != null && n < min) || (max != null && n > max);
  return (
    <span className="sb-numwrap">
      <input className={`x-input m sb-num ${bad ? 'is-bad' : ''}`} type="number" inputMode="decimal" aria-label={label} aria-invalid={bad} step={step ?? 'any'} min={min} max={max} value={text} placeholder={placeholder} title={placeholder ? `${label}: blank uses ${placeholder}` : undefined} data-testid={testId}
        onChange={e => { setText(e.target.value); const v = Number(e.target.value); if (e.target.value.trim() === '' && allowEmpty) onChange(null); else if (e.target.value.trim() !== '' && Number.isFinite(v) && (min == null || v >= min) && (max == null || v <= max)) onChange(v); }} />
      {suffix && <span className="x-muted">{suffix}</span>}
    </span>
  );
}

function Seg<T extends string>({ value, options, onChange, label, testId }: { value: T; options: Array<[T, string]>; onChange: (v: T) => void; label: string; testId?: string }) {
  return (
    <div className="x-seg x-seg--in x-seg--sm" role="radiogroup" aria-label={label} data-testid={testId}>
      {options.map(([v, t]) => <button key={v} type="button" role="radio" aria-checked={value === v} onClick={() => onChange(v)} data-testid={testId ? `${testId}-${v}` : undefined}>{t}</button>)}
    </div>
  );
}
const Field = ({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) => (
  <div className="x-field sb-field"><label>{label}</label>{children}{hint && <span className="x-help">{hint}</span>}</div>
);

export function MarketZone({ spec, set }: { spec: StrategySpec; set: Set }) {
  const m = spec.market;
  const max = VENUES[m.venue].maxLeverage;
  const sl = spec.risk.stopLoss;
  const liq = 100 / m.leverage - 0.5;
  return (
    <div className="sb-zone-b">
      <Field label="Exchange">
        <select className="x-select" value={m.venue} onChange={e => set(s => ({ ...s, market: { ...s.market, venue: e.target.value as Venue } }))} data-testid="sb-venue">
          {(Object.keys(VENUES) as Venue[]).map(v => <option key={v} value={v}>{VENUES[v].label}</option>)}
        </select>
      </Field>
      <Field label="Markets" hint="Perpetual futures. Each market can have its own leverage.">
        <div className="sb-syms" data-testid="sb-symbols">
          {m.symbols.map(x => (
            <span key={x.symbol} className="sb-sym">
              <b>{x.symbol}</b>
              <Num value={x.leverage ?? null} allowEmpty min={1} max={max} label={`${x.symbol} leverage`} placeholder={String(m.leverage ?? 1)} suffix="×" onChange={v => set(s => ({ ...s, market: { ...s.market, symbols: s.market.symbols.map(y => (y.symbol === x.symbol ? { symbol: y.symbol, ...(v == null ? {} : { leverage: v }) } : y)) } }))} />
              <button type="button" aria-label={`Remove ${x.symbol}`} onClick={() => set(s => ({ ...s, market: { ...s.market, symbols: s.market.symbols.filter(y => y.symbol !== x.symbol) } }))} data-testid={`sb-rm-${x.symbol}`}><X size={12} weight="bold" aria-hidden /></button>
            </span>
          ))}
          {m.symbols.length < 20 && <div className="sb-add"><SymbolSearch value="" onSelect={sym => set(s => (s.market.symbols.some(y => y.symbol === sym) ? s : { ...s, market: { ...s.market, symbols: [...s.market.symbols, { symbol: sym }] } }))} /></div>}
        </div>
      </Field>
      <div className="sb-row">
        <Field label="Direction"><Seg value={m.direction} label="Direction" testId="sb-dir" options={[['long', 'Long'], ['short', 'Short'], ['both', 'Both']]} onChange={v => set(s => ({ ...s, market: { ...s.market, direction: v }, entry: { ...s.entry, short: v === 'long' ? s.entry.short : s.entry.short ?? 'mirror' } }))} /></Field>
        <Field label="Margin"><Seg value={m.marginMode} label="Margin mode" options={[['isolated', 'Isolated'], ['cross', 'Cross']]} onChange={v => set(s => ({ ...s, market: { ...s.market, marginMode: v } }))} /></Field>
        <Field label="Leverage" hint={<>Liquidation about {liq > 0 ? liq.toFixed(1) : '0'}% away{sl?.mode === 'pct' && sl.value >= liq ? <b className="neg"> · beyond your {sl.value}% stop</b> : ''}</>}>
          <Num value={m.leverage} min={1} max={max} step={1} label="Leverage" suffix="×" testId="sb-lev" onChange={v => v != null && set(s => ({ ...s, market: { ...s.market, leverage: v } }))} />
        </Field>
      </div>
    </div>
  );
}

export function SessionZone({ spec, set }: { spec: StrategySpec; set: Set }) {
  const se = spec.session;
  const setW = (k: number, w: Partial<SessionWindow>) => set(s => ({ ...s, session: { ...s.session, windows: s.session.windows.map((x, i) => (i === k ? { ...x, ...w } : x)) } }));
  return (
    <div className="sb-zone-b">
      <Field label="Bar interval"><Seg value={se.interval} label="Interval" testId="sb-int" options={INTERVALS.map(i => [i, i])} onChange={v => set(s => ({ ...s, session: { ...s.session, interval: v as Interval } }))} /></Field>
      <div className="sb-row">
        <Field label="When to enter"><Seg value={se.mode} label="Session" testId="sb-sess" options={[['24_7', 'Around the clock'], ['windows', 'Only in windows']]} onChange={v => set(s => ({ ...s, session: { ...s.session, mode: v, windows: v === 'windows' && !s.session.windows.length ? [PRESETS[1]!.w] : s.session.windows } }))} /></Field>
        <Field label="Time zone">
          <select className="x-select" value={se.timezone} onChange={e => set(s => ({ ...s, session: { ...s.session, timezone: e.target.value } }))} data-testid="sb-tz">
            {[...new Set([se.timezone, ...TIMEZONES])].map(t => <option key={t} value={t}>{t}</option>)}
          </select>
        </Field>
      </div>
      {se.mode === 'windows' && (
        <div className="sb-windows">
          <div className="sb-presets">{PRESETS.map(p => <button key={p.label} type="button" className="x-btn x-btn--sm" onClick={() => set(s => ({ ...s, session: { ...s.session, windows: [...s.session.windows, p.w] } }))}><Plus size={13} weight="bold" aria-hidden />{p.label}</button>)}</div>
          {se.windows.map((w, k) => (
            <div key={k} className="sb-window" data-testid={`sb-window-${k}`}>
              <div className="sb-days">{DAYS.map((d, i) => <button key={d} type="button" aria-pressed={w.days.includes(i)} onClick={() => setW(k, { days: w.days.includes(i) ? w.days.filter(x => x !== i) : [...w.days, i].sort() })}>{d}</button>)}</div>
              <input className="x-input m sb-time" type="time" value={w.start} onChange={e => setW(k, { start: e.target.value })} aria-label="From" />
              <span className="x-muted">to</span>
              <input className="x-input m sb-time" type="time" value={w.end} onChange={e => setW(k, { end: e.target.value })} aria-label="To" />
              <button type="button" className="x-btn x-btn--sm x-btn--ghost" onClick={() => set(s => ({ ...s, session: { ...s.session, windows: s.session.windows.filter((_, i) => i !== k) } }))}>Remove</button>
            </div>
          ))}
          <p className="cp-fine">Windows only limit new entries. Stops, targets and exits always run.</p>
        </div>
      )}
    </div>
  );
}

const blank = (): SignalGroup => ({ match: 'all', conditions: [emptyCondition()] });

export function EntryZone({ spec, set, catalogue }: { spec: StrategySpec; set: Set; catalogue: CatalogueItem[] }) {
  const e = spec.entry;
  const d = spec.market.direction;
  return (
    <div className="sb-zone-b">
      {d !== 'short' && (
        <Field label="Enter long when">
          <GroupEditor group={e.long ?? { match: 'all', conditions: [] }} onChange={g => set(s => ({ ...s, entry: { ...s.entry, long: g } }))} catalogue={catalogue} interval={spec.session.interval} testId="sb-long" emptyText={e.atTimes?.length ? 'No filters: enters at the trigger times.' : 'Add a condition to enter long.'} />
        </Field>
      )}
      {d !== 'long' && (
        <Field label="Enter short when">
          <Seg value={e.short === 'mirror' ? 'mirror' : e.short ? 'custom' : 'none'} label="Short rules" testId="sb-shortmode"
            options={d === 'short' ? [['custom', 'Own rules']] : [['mirror', 'Mirror the long rules'], ['custom', 'Own rules']]}
            onChange={v => set(s => ({ ...s, entry: { ...s.entry, short: v === 'mirror' ? 'mirror' : s.entry.short && s.entry.short !== 'mirror' ? s.entry.short : blank() } }))} />
          {e.short && e.short !== 'mirror' && <GroupEditor group={e.short} onChange={g => set(s => ({ ...s, entry: { ...s.entry, short: g } }))} catalogue={catalogue} interval={spec.session.interval} testId="sb-short" />}
          {e.short === 'mirror' && <span className="x-help">Above becomes below and crosses flip; RSI 30 becomes 70.</span>}
        </Field>
      )}
      <Field label="Time trigger" hint="Only enter on bars opening at these times; conditions then act as filters.">
        <div className="sb-times">
          {(e.atTimes ?? []).map((t, k) => (
            <span key={k} className="sb-sym"><input className="x-input m sb-time" type="time" value={t} onChange={ev => set(s => ({ ...s, entry: { ...s.entry, atTimes: (s.entry.atTimes ?? []).map((x, i) => (i === k ? ev.target.value : x)) } }))} /><button type="button" aria-label="Remove time" onClick={() => set(s => ({ ...s, entry: { ...s.entry, atTimes: (s.entry.atTimes ?? []).filter((_, i) => i !== k) || null } }))}><X size={12} weight="bold" aria-hidden /></button></span>
          ))}
          <button type="button" className="x-btn x-btn--sm" onClick={() => set(s => ({ ...s, entry: { ...s.entry, atTimes: [...(s.entry.atTimes ?? []), '09:00'] } }))} data-testid="sb-addtime"><Plus size={13} weight="bold" aria-hidden />Time</button>
        </div>
      </Field>
    </div>
  );
}

export function ExitZone({ spec, set, catalogue }: { spec: StrategySpec; set: Set; catalogue: CatalogueItem[] }) {
  const x = spec.exit;
  return (
    <div className="sb-zone-b">
      <label className="sb-check"><input type="checkbox" checked={x.onOppositeSignal} onChange={e => set(s => ({ ...s, exit: { ...s.exit, onOppositeSignal: e.target.checked } }))} data-testid="sb-opposite" /> Exit when the opposite entry signal fires</label>
      <Field label="Also exit a long when">
        {x.long ? <GroupEditor group={x.long} onChange={g => set(s => ({ ...s, exit: { ...s.exit, long: g.conditions.length ? g : null } }))} catalogue={catalogue} interval={spec.session.interval} testId="sb-xlong" />
          : <button type="button" className="x-btn x-btn--sm" onClick={() => set(s => ({ ...s, exit: { ...s.exit, long: blank(), short: s.market.direction !== 'long' ? 'mirror' : s.exit.short } }))} data-testid="sb-addexit"><Plus size={13} weight="bold" aria-hidden />Exit signal</button>}
      </Field>
      {x.long && spec.market.direction !== 'long' && <span className="x-help">Short exits mirror the long exit.</span>}
    </div>
  );
}

export function RiskZone({ spec, set }: { spec: StrategySpec; set: Set }) {
  const r = spec.risk;
  const R = (fn: (r: StrategySpec['risk']) => StrategySpec['risk']) => set(s => ({ ...s, risk: fn(s.risk) }));
  return (
    <div className="sb-zone-b">
      <div className="sb-row">
        <Field label="Stop loss">
          <div className="sb-inline">
            <select className="x-select" value={r.stopLoss?.mode ?? 'none'} onChange={e => R(x => ({ ...x, stopLoss: e.target.value === 'none' ? null : { mode: e.target.value as 'pct', value: e.target.value === 'atr' ? 2 : 2, ...(e.target.value === 'atr' ? { atrLength: 14 } : {}) } }))} data-testid="sb-sl-mode">
              <option value="none">None</option><option value="pct">% from entry</option><option value="atr">× ATR</option><option value="points">Points</option><option value="price">Price</option>
            </select>
            {r.stopLoss && <Num value={r.stopLoss.value} min={0.0001} label="Stop size" testId="sb-sl" onChange={v => v != null && R(x => ({ ...x, stopLoss: { ...x.stopLoss!, value: v } }))} />}
          </div>
        </Field>
        <Field label="Take profit">
          <div className="sb-inline">
            <select className="x-select" value={r.takeProfit?.mode ?? 'none'} onChange={e => R(x => ({ ...x, takeProfit: e.target.value === 'none' ? null : { mode: e.target.value as 'rr', value: e.target.value === 'rr' ? 2 : 4 } }))} data-testid="sb-tp-mode">
              <option value="none">None</option><option value="rr">× risk (R)</option><option value="pct">% from entry</option><option value="points">Points</option><option value="price">Price</option>
            </select>
            {r.takeProfit && <Num value={r.takeProfit.value} min={0.0001} label="Target size" testId="sb-tp" onChange={v => v != null && R(x => ({ ...x, takeProfit: { ...x.takeProfit!, value: v } }))} />}
          </div>
        </Field>
      </div>
      <div className="sb-row">
        <Field label="Trailing stop">
          <div className="sb-inline">
            <select className="x-select" value={r.trailing?.mode ?? 'none'} onChange={e => R(x => ({ ...x, trailing: e.target.value === 'none' ? null : { mode: e.target.value as 'pct', value: e.target.value === 'atr' ? 2 : 1.5 } }))} data-testid="sb-trail-mode">
              <option value="none">None</option><option value="pct">% behind</option><option value="atr">× ATR behind</option>
            </select>
            {r.trailing && <><Num value={r.trailing.value} min={0.0001} label="Trail distance" onChange={v => v != null && R(x => ({ ...x, trailing: { ...x.trailing!, value: v } }))} /><Num value={r.trailing.activateAtR ?? null} allowEmpty min={0} label="Start trailing at R" suffix="R to start" onChange={v => R(x => ({ ...x, trailing: { ...x.trailing!, ...(v == null ? { activateAtR: undefined } : { activateAtR: v }) } }))} /></>}
          </div>
        </Field>
        <Field label="Time stop"><Num value={r.timeStopBars} allowEmpty min={1} step={1} label="Time stop bars" suffix="bars" testId="sb-time" onChange={v => R(x => ({ ...x, timeStopBars: v == null ? null : Math.round(v) }))} /></Field>
        <Field label="Break-even"><Num value={r.breakEvenAtR} allowEmpty min={0.1} label="Break-even at R" suffix="R" testId="sb-be" onChange={v => R(x => ({ ...x, breakEvenAtR: v }))} /></Field>
      </div>
      <Field label="Partial exits">
        <div className="sb-partials">
          {r.partials.map((p, k) => (
            <span key={k} className="sb-sym">
              <Num value={p.closePct} min={1} max={100} label="Close %" suffix="% at" onChange={v => v != null && R(x => ({ ...x, partials: x.partials.map((q, i) => (i === k ? { ...q, closePct: v } : q)) }))} />
              <Num value={p.atR} min={0.1} label="At R" suffix="R" onChange={v => v != null && R(x => ({ ...x, partials: x.partials.map((q, i) => (i === k ? { ...q, atR: v } : q)) }))} />
              <button type="button" aria-label="Remove partial" onClick={() => R(x => ({ ...x, partials: x.partials.filter((_, i) => i !== k) }))}><X size={12} weight="bold" aria-hidden /></button>
            </span>
          ))}
          {r.partials.length < 5 && <button type="button" className="x-btn x-btn--sm" onClick={() => R(x => ({ ...x, partials: [...x.partials, { atR: 1, closePct: 50 }] }))} data-testid="sb-addpartial"><Plus size={13} weight="bold" aria-hidden />Partial</button>}
        </div>
      </Field>
    </div>
  );
}

export function SizingZone({ spec, set }: { spec: StrategySpec; set: Set }) {
  const z = spec.sizing;
  const UNIT: Record<Sizing['mode'], string> = { risk_pct: '% of equity at risk', equity_pct: '% of equity as margin', qty: 'units', notional: 'USDT position', atr: '% of equity per ATR', kelly: '% of equity until 20 trades' };
  return (
    <div className="sb-zone-b">
      <div className="sb-row">
        <Field label="Size by">
          <select className="x-select" value={z.mode} onChange={e => set(s => ({ ...s, sizing: { mode: e.target.value as 'risk_pct', value: e.target.value === 'notional' ? 1000 : e.target.value === 'qty' ? 1 : 1 } }))} data-testid="sb-size-mode">
            <option value="risk_pct">Risk % (from the stop)</option><option value="equity_pct">% of equity</option><option value="notional">Fixed USDT</option><option value="qty">Fixed quantity</option><option value="atr">ATR-scaled</option><option value="kelly">Kelly fraction</option>
          </select>
        </Field>
        <Field label="Amount"><Num value={z.value} min={0.0001} label="Size" suffix={UNIT[z.mode]} testId="sb-size" onChange={v => v != null && set(s => ({ ...s, sizing: { ...s.sizing, value: v } as Sizing }))} /></Field>
        {z.mode === 'kelly' && <Field label="Kelly share"><Num value={(z.kellyFraction ?? 0.5) * 100} min={5} max={100} label="Kelly share" suffix="% of full Kelly" onChange={v => v != null && set(s => ({ ...s, sizing: { ...s.sizing, kellyFraction: v / 100 } as Sizing }))} /></Field>}
      </div>
    </div>
  );
}

export function AdvancedZone({ spec, set }: { spec: StrategySpec; set: Set }) {
  const a = spec.advanced;
  const A = (p: Partial<StrategySpec['advanced']>) => set(s => ({ ...s, advanced: { ...s.advanced, ...p } }));
  const L = (p: Partial<StrategySpec['limits']>) => set(s => ({ ...s, limits: { ...s.limits, ...p } }));
  return (
    <div className="sb-zone-b">
      <div className="sb-row">
        <Field label="Entry order"><Seg value={a.entryType} label="Entry order" testId="sb-etype" options={[['market', 'Market'], ['limit', 'Limit (pullback)']]} onChange={v => A({ entryType: v })} /></Field>
        {a.entryType === 'limit' && <>
          <Field label="Limit offset"><Num value={a.limitOffsetPct} min={0} max={20} label="Limit offset" suffix="% better" onChange={v => v != null && A({ limitOffsetPct: v })} /></Field>
          <Field label="Cancel after"><Num value={a.limitExpiryBars} min={1} step={1} label="Expiry bars" suffix="bars" onChange={v => v != null && A({ limitExpiryBars: Math.round(v) })} /></Field>
        </>}
      </div>
      <div className="sb-row">
        <Field label="Re-entry wait"><Num value={a.reentryCooldownBars} min={0} step={1} label="Re-entry cooldown" suffix="bars after an exit" onChange={v => v != null && A({ reentryCooldownBars: Math.round(v) })} /></Field>
        <Field label="Max trades a day"><Num value={a.maxTradesPerDay} allowEmpty min={1} step={1} label="Max trades per day" testId="sb-maxday" onChange={v => A({ maxTradesPerDay: v == null ? null : Math.round(v) })} /></Field>
      </div>
      <div className="sb-row">
        <Field label="Daily loss cap" hint="Pauses new entries for the rest of the day."><Num value={spec.limits.dailyLossPct} allowEmpty min={0.1} max={100} label="Daily loss cap" suffix="% of equity" testId="sb-dll" onChange={v => L({ dailyLossPct: v })} /></Field>
        <Field label="Losing-streak stop" hint="Stops the strategy after this many losses in a row."><Num value={spec.limits.maxConsecutiveLosses} allowEmpty min={1} step={1} label="Max consecutive losses" suffix="losses" testId="sb-streak" onChange={v => L({ maxConsecutiveLosses: v == null ? null : Math.round(v) })} /></Field>
      </div>
    </div>
  );
}
