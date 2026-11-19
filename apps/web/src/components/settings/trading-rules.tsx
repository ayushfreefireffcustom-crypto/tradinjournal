'use client';

// Settings › Trading rules: the trader's own rules (each a switch + value), the
// risk cap the Charts risk ruler uses, and a live line per rule computed from
// the selected account's last 90 days (POST /api/insights/rules-preview).
// Broken rules show as "Your rule" in grades, the trade log, Analytics and the
// dashboard plan. While settings storage isn't set up the form still previews,
// and saving says so calmly.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Switch } from '@/components/v6/account/settings';
import { ICheck } from '@/components/v6/icons';
import {
  activeOnly, DEFAULT_RISK_CAP_PCT, parseRiskCap, parseRuleValue, prefsApi, previewLine, RULE_BOUNDS, RULE_DEFAULT, RULE_KEYS, RULE_TITLE,
  sameRules, useTradingPrefs, validHours, type RuleKey, type RulesPreviewDTO, type TradingRules,
} from '@/lib/trading-prefs';
import './trading-rules.css';
import ErrorCard from '@/components/v6/ui/error-card';

type NumKey = Exclude<RuleKey, 'tradingHours'>;
interface Draft {
  on: Record<RuleKey, boolean>;
  text: Record<NumKey, string>;
  hours: { from: string; to: string };
  cap: string;
}
const UNIT: Record<NumKey, string> = { maxTradesPerDay: 'trades', maxRiskPct: '%', stopAfterLosses: 'losses', dailyLossCapPct: '%', maxSizeX: '× usual' };
const DESC: Record<RuleKey, string> = {
  maxTradesPerDay: 'Trades opened in one UTC day',
  tradingHours: 'Open trades only inside these UTC hours',
  maxRiskPct: 'Stop distance as % of balance. Needs a stop at entry',
  stopAfterLosses: 'Losing trades closed earlier that UTC day',
  dailyLossCapPct: 'Day’s closed loss as % of the day’s start balance',
  maxSizeX: 'Volume vs your median size on that symbol',
};
const NUM_KEYS = RULE_KEYS.filter((k): k is NumKey => k !== 'tradingHours');

function draftOf(rules: TradingRules, cap: number): Draft {
  const on = Object.fromEntries(RULE_KEYS.map(k => [k, rules[k] != null])) as Record<RuleKey, boolean>;
  const text = Object.fromEntries(NUM_KEYS.map(k => [k, String(rules[k] ?? RULE_DEFAULT[k])])) as Record<NumKey, string>;
  return { on, text, hours: rules.tradingHours ?? { ...RULE_DEFAULT.tradingHours }, cap: String(cap) };
}
/** Draft → rules (null when a switched-on value is invalid). */
function rulesOf(d: Draft): { rules: TradingRules; bad: RuleKey[] } {
  const rules: TradingRules = {};
  const bad: RuleKey[] = [];
  for (const k of NUM_KEYS) {
    if (!d.on[k]) { rules[k] = null; continue; }
    const v = parseRuleValue(k, d.text[k]);
    if (v == null) bad.push(k); else rules[k] = v;
  }
  if (d.on.tradingHours) { if (validHours(d.hours)) rules.tradingHours = { ...d.hours }; else bad.push('tradingHours'); } else rules.tradingHours = null;
  return { rules, bad };
}

export default function TradingRulesSection({ accountId }: { accountId: string | null }) {
  const { state, prefs, save } = useTradingPrefs();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [notReady, setNotReady] = useState(false);
  const [preview, setPreview] = useState<{ status: 'idle' | 'loading' | 'ready' | 'error'; data: RulesPreviewDTO | null }>({ status: 'idle', data: null });

  useEffect(() => { if (prefs && !draft) setDraft(draftOf(prefs.rules, prefs.riskCapPct)); }, [prefs, draft]);
  useEffect(() => { if (prefs && !prefs.persisted) setNotReady(true); }, [prefs]);
  useEffect(() => { if (!saved) return; const t = setTimeout(() => setSaved(false), 2000); return () => clearTimeout(t); }, [saved]);

  const parsed = useMemo(() => (draft ? rulesOf(draft) : null), [draft]);
  const cap = draft ? parseRiskCap(draft.cap) : null;
  const dirty = !!(prefs && draft && parsed && (!sameRules(parsed.rules, prefs.rules) || parsed.bad.length > 0 || cap !== prefs.riskCapPct));
  const valid = !!parsed && parsed.bad.length === 0 && cap != null;

  // Live preview of the switched-on rules (debounced, unsaved values included).
  const active = parsed ? activeOnly(parsed.rules) : null;
  const previewKey = accountId && active && Object.keys(active).length ? `${accountId}|${JSON.stringify(active)}` : '';
  const req = useRef<AbortController | null>(null);
  useEffect(() => {
    req.current?.abort();
    if (!previewKey || !active || !accountId) { setPreview({ status: 'idle', data: null }); return; }
    const ctl = new AbortController();
    req.current = ctl;
    setPreview(p => ({ status: 'loading', data: p.data }));
    const t = setTimeout(() => {
      prefsApi.preview(accountId, active, 90, ctl.signal)
        .then(d => { if (!ctl.signal.aborted) setPreview({ status: 'ready', data: d }); })
        .catch(() => { if (!ctl.signal.aborted) setPreview({ status: 'error', data: null }); });
    }, 350);
    return () => { clearTimeout(t); ctl.abort(); };
  }, [previewKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (fn: (d: Draft) => Draft) => { setDraft(d => (d ? fn(d) : d)); setError(''); };

  async function onSave() {
    if (!parsed || !valid || saving || cap == null) return;
    setSaving(true); setError('');
    const r = await save({ rules: parsed.rules, riskCapPct: cap });
    setSaving(false);
    if (r.ok) { setSaved(true); setNotReady(false); return; }
    if (r.local) { setNotReady(true); return; }
    setError(r.error ?? 'Could not save that. Please try again.');
  }
  const discard = () => { if (prefs) setDraft(draftOf(prefs.rules, prefs.riskCapPct)); setError(''); };

  const pv = preview.data;
  const anyOn = !!active && Object.keys(active).length > 0;

  return (
    <section className="x-card ac-st-card tr" id="trading-rules" data-testid="trading-rules" aria-labelledby="tr-h">
      <div className="x-ch">
        <h2 id="tr-h">Trading rules</h2>
        <span className="x-sub">Graded as “Your rule” everywhere</span>
      </div>
      {state.status === 'loading' || (prefs && !draft) ? (
        <div className="ac-st-sk" data-testid="trading-rules-loading" aria-busy="true">{[0, 1, 2, 3].map(i => <i key={i} className="x-skel x-skel--in" />)}</div>
      ) : state.status === 'error' ? (
        <div data-testid="trading-rules-error"><ErrorCard bare compact title="Couldn’t load your rules" message={state.error} /></div>
      ) : draft && parsed && (
        <>
          <div className="ac-st-grp">
            {anyOn && accountId && (
              <p className={`ac-st-note tr-sum${preview.status === 'loading' ? ' tr-stale' : ''}`} data-testid="rules-summary" aria-live="polite">
                {pv ? (pv.any.n ? <>Last {pv.days} days: <b className="tr-n">{pv.any.n}</b> of {pv.trades} trades broke a rule · <b className={`tr-n ${pv.any.net < 0 ? 'dn' : pv.any.net > 0 ? 'up' : ''}`}>{money(pv.any.net)}</b></> : `Last ${pv.days} days: ${pv.trades} trades, every rule kept`)
                  : preview.status === 'error' ? 'Preview unavailable right now' : 'Checking your last 90 days…'}
              </p>
            )}
            {!accountId && <p className="ac-st-note" data-testid="rules-no-account">Connect an account to see how often you broke these.</p>}
            {RULE_KEYS.map(k => {
              const on = draft.on[k];
              const isBad = on && parsed.bad.includes(k);
              const row = pv?.rules[k];
              const line = on && pv && preview.status !== 'error' ? previewLine(row, pv.days, k) : '';
              return (
                <div className={`ac-st-row tr-row${on ? '' : ' off'}`} key={k} data-testid={`rule-${k}`}>
                  <div className="ac-st-row-t">
                    <b>{RULE_TITLE[k]}</b>
                    <span>{DESC[k]}</span>
                    {line && <span className={`tr-pv${preview.status === 'loading' ? ' tr-stale' : ''}`} data-testid={`preview-${k}`}><PreviewText line={line} net={row?.n ? row.net : 0} /></span>}
                  </div>
                  <div className="ac-st-row-c tr-ctl">
                    {k === 'tradingHours' ? (
                      <span className="tr-hrs">
                        <input className="x-input tr-in tr-time" inputMode="numeric" maxLength={5} placeholder="HH:MM" value={draft.hours.from} disabled={!on} aria-label="From (UTC)" aria-invalid={isBad || undefined}
                          onChange={e => set(d => ({ ...d, hours: { ...d.hours, from: e.target.value } }))} data-testid="hours-from" />
                        <span aria-hidden>–</span>
                        <input className="x-input tr-in tr-time" inputMode="numeric" maxLength={5} placeholder="HH:MM" value={draft.hours.to} disabled={!on} aria-label="To (UTC)" aria-invalid={isBad || undefined}
                          onChange={e => set(d => ({ ...d, hours: { ...d.hours, to: e.target.value } }))} data-testid="hours-to" />
                        <small>UTC</small>
                      </span>
                    ) : (
                      <label className="tr-val">
                        <input className="x-input tr-in" inputMode="decimal" value={draft.text[k]} disabled={!on} aria-label={`${RULE_TITLE[k]} value`} aria-invalid={isBad || undefined}
                          onChange={e => set(d => ({ ...d, text: { ...d.text, [k]: e.target.value } }))} data-testid={`value-${k}`} />
                        <small>{UNIT[k]}</small>
                      </label>
                    )}
                    <Switch on={on} onClick={() => set(d => ({ ...d, on: { ...d.on, [k]: !d.on[k] } }))} label={RULE_TITLE[k]} testId={`toggle-${k}`} />
                  </div>
                  {isBad && <span className="tr-bad" role="alert">{k === 'tradingHours' ? 'Use HH:MM (24h), two different times' : `Use ${RULE_BOUNDS[k as NumKey].min}–${RULE_BOUNDS[k as NumKey].max}`}</span>}
                </div>
              );
            })}
          </div>
          <div className="ac-st-grp">
            <h3>Charts</h3>
            <div className="ac-st-row tr-row" data-testid="risk-cap">
              <div className="ac-st-row-t"><b>Risk cap</b><span>Day risk limit on the Charts risk ruler. Default {DEFAULT_RISK_CAP_PCT}%</span></div>
              <div className="ac-st-row-c tr-ctl">
                <label className="tr-val">
                  <input className="x-input tr-in" inputMode="decimal" value={draft.cap} aria-label="Risk cap percent" aria-invalid={cap == null || undefined}
                    onChange={e => set(d => ({ ...d, cap: e.target.value }))} data-testid="value-riskCap" />
                  <small>% a day</small>
                </label>
              </div>
              {cap == null && <span className="tr-bad" role="alert">Use 0.1–10</span>}
            </div>
          </div>
          {notReady && <p className="tr-calm" role="status" data-testid="prefs-not-ready">Settings storage isn’t ready yet, so these can’t be saved. The preview above still works.</p>}
          {error && <div className="x-banner x-banner--err ac-st-err" role="alert" data-testid="trading-rules-save-error"><span>{error}</span></div>}
          <footer className="ac-st-ft">
            <span className="ac-st-tz">Days and hours are UTC</span>
            {saved && <span className="ac-st-saved" role="status" data-testid="trading-rules-saved"><ICheck size={14} />Saved</span>}
            {dirty && !saving && <button type="button" className="x-btn x-btn--ghost" onClick={discard}>Discard</button>}
            <button type="button" className="x-btn x-btn--hi" onClick={() => void onSave()} disabled={!dirty || !valid || saving || (notReady && !!prefs && !prefs.persisted)} data-testid="trading-rules-save">{saving ? 'Saving…' : 'Save rules'}</button>
          </footer>
        </>
      )}
    </section>
  );
}

/** The preview line with its $ figure coloured by sign. */
function PreviewText({ line, net }: { line: string; net: number }) {
  const i = line.lastIndexOf(' · ');
  if (i < 0 || !net) return <>{line}</>;
  return <>{line.slice(0, i)} · <b className={`tr-n ${net < 0 ? 'dn' : 'up'}`}>{line.slice(i + 3)}</b></>;
}

function money(v: number): string {
  const a = Math.abs(Math.round(v));
  return `${v < 0 ? '−' : v > 0 ? '+' : ''}$${a.toLocaleString('en-US')}`;
}
