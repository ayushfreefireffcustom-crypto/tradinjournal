'use client';

import { useEffect, useMemo, useState, useCallback } from 'react';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import { api, type BrokerAccount, type Trade, type JournalEntry } from '@/lib/api';
import { useAccounts } from '@/lib/use-accounts';

function fmtDur(s: number | null) {
  if (s == null) return '—';
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}

// Deterministic synthetic OHLC walk + entry/exit markers for any trade
function buildCandles(trade: Trade | null, n = 70) {
  if (!trade) return { candles: [] as { o: number; h: number; l: number; c: number }[], entryIdx: 0, exitIdx: 0, min: 0, max: 1 };
  const seed = parseInt(trade.positionId, 10) || 1;
  // Simple seeded LCG
  let s = seed;
  const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return ((s >>> 0) / 4294967296); };

  const baseVol = trade.symbol === 'XAUUSD' ? 0.4
    : trade.symbol === 'BTCUSD' ? 80
    : trade.symbol === 'USDJPY' ? 0.08
    : trade.symbol.includes('100') || trade.symbol.includes('30') ? 18
    : 0.0008;

  const entryIdx = Math.floor(n * 0.25);
  const exitIdx  = Math.floor(n * 0.70);
  const entry = trade.entryPrice;
  const exit  = trade.exitPrice ?? entry;

  let price = entry - (rand() - 0.3) * baseVol * 14;
  const candles: { o: number; h: number; l: number; c: number }[] = [];
  const drift = (exit - price) / (exitIdx - 0);
  for (let i = 0; i < n; i++) {
    const o = price;
    const noise = (rand() - 0.5) * baseVol * 3;
    const d = i <= exitIdx ? drift : (rand() - 0.5) * baseVol * 2;
    price = price + d + noise;
    const c = price;
    const h = Math.max(o, c) + Math.abs(noise) * 0.6;
    const l = Math.min(o, c) - Math.abs(noise) * 0.6;
    candles.push({ o, h, l, c });
  }
  // Force precise entry/exit prices on those candles
  candles[entryIdx]!.c = entry;
  candles[exitIdx]!.c = exit;

  const min = Math.min(...candles.map(c => c.l));
  const max = Math.max(...candles.map(c => c.h));
  return { candles, entryIdx, exitIdx, min, max };
}

function CandleChart({ trade }: { trade: Trade | null }) {
  const { candles, entryIdx, exitIdx, min, max } = useMemo(() => buildCandles(trade, 70), [trade]);
  if (!trade || candles.length === 0) {
    return <div className="flex items-center justify-center h-full text-fg-3 text-[12px]">Select a trade →</div>;
  }
  const W = 900, H = 460;
  const PAD = { top: 20, right: 70, bottom: 30, left: 14 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const span = max - min || 1;
  const gap = 2;
  const cw = (innerW - gap * (candles.length - 1)) / candles.length;
  const toX = (i: number) => PAD.left + i * (cw + gap);
  const toY = (v: number) => PAD.top + innerH - ((v - min) / span) * innerH;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none" data-testid="candle-chart">
      <defs>
        <pattern id="grid" width="60" height="60" patternUnits="userSpaceOnUse">
          <path d="M 60 0 L 0 0 0 60" fill="none" stroke="#1E1E1E" strokeWidth="0.5" />
        </pattern>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill="url(#grid)" />

      {/* y axis labels (right) */}
      {Array.from({ length: 5 }).map((_, i) => {
        const v = min + (span * i) / 4;
        return (
          <g key={i}>
            <line x1={PAD.left} x2={W - PAD.right} y1={toY(v)} y2={toY(v)} stroke="#1E1E1E" strokeDasharray="2 4" />
            <text x={W - PAD.right + 8} y={toY(v) + 4} fontSize="10" style={{ fontFamily: 'var(--font-mono)' }} fill="#71717A">{v.toFixed(trade.symbol === 'USDJPY' ? 3 : trade.symbol === 'BTCUSD' || trade.symbol.includes('100') || trade.symbol.includes('30') ? 1 : 5)}</text>
          </g>
        );
      })}

      {/* candles */}
      {candles.map((cd, i) => {
        const up = cd.c >= cd.o;
        const color = up ? '#08C465' : '#FE3A31';
        const x = toX(i);
        const yH = toY(cd.h);
        const yL = toY(cd.l);
        const yO = toY(cd.o);
        const yC = toY(cd.c);
        const top = Math.min(yO, yC);
        const bot = Math.max(yO, yC);
        return (
          <g key={i}>
            <line x1={x + cw / 2} x2={x + cw / 2} y1={yH} y2={yL} stroke={color} strokeWidth="1" />
            <rect x={x} y={top} width={cw} height={Math.max(1, bot - top)} fill={color} />
          </g>
        );
      })}

      {/* Entry / exit lines */}
      <line x1={PAD.left} x2={W - PAD.right} y1={toY(trade.entryPrice)} y2={toY(trade.entryPrice)} stroke="#FFFFFF" strokeDasharray="3 3" opacity="0.6" />
      <line x1={PAD.left} x2={W - PAD.right} y1={toY(trade.exitPrice ?? trade.entryPrice)} y2={toY(trade.exitPrice ?? trade.entryPrice)} stroke={trade.netPnl >= 0 ? '#08C465' : '#FE3A31'} strokeDasharray="3 3" opacity="0.7" />

      {/* Entry marker */}
      <g transform={`translate(${toX(entryIdx) + cw / 2}, ${toY(trade.entryPrice)})`}>
        <polygon points="-6,-6 6,-6 0,0" fill={trade.direction === 'LONG' ? '#08C465' : '#FE3A31'} />
        <text x="-8" y="-10" textAnchor="end" fontSize="10" style={{ fontFamily: 'var(--font-mono)' }} fill="#FFFFFF">ENTRY {trade.entryPrice}</text>
      </g>

      {/* Exit marker */}
      <g transform={`translate(${toX(exitIdx) + cw / 2}, ${toY(trade.exitPrice ?? trade.entryPrice)})`}>
        <polygon points="-6,6 6,6 0,0" fill={trade.netPnl >= 0 ? '#08C465' : '#FE3A31'} />
        <text x="8" y="14" fontSize="10" style={{ fontFamily: 'var(--font-mono)' }} fill="#FFFFFF">EXIT {trade.exitPrice}</text>
      </g>
    </svg>
  );
}

export default function ChartReplayPage() {
  const { accounts, selected, select, setAccounts } = useAccounts();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [journalEntries, setJournalEntries] = useState<JournalEntry[]>([]);
  const [note, setNote] = useState('');
  const [emotion, setEmotion] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);

  const loadTrades = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [t, j] = await Promise.all([
        api.trades.list(acc.id),
        api.journal.list(acc.id),
      ]);
      setTrades(t);
      setJournalEntries(j);
      setActiveId(t[0]?.positionId ?? null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load trades');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { if (selected) loadTrades(selected); }, [selected, loadTrades]);

  const active = trades.find(t => t.positionId === activeId) ?? null;

  const journalByTrade = useMemo(() => {
    const map = new Map<string, JournalEntry>();
    for (const e of journalEntries) if (e.tradeId) map.set(e.tradeId, e);
    return map;
  }, [journalEntries]);
  const activeEntry = activeId ? journalByTrade.get(activeId) ?? null : null;

  // Load the active trade's saved journal entry (or clear the form for a fresh one)
  useEffect(() => {
    setNote(activeEntry?.body ?? '');
    setEmotion(activeEntry?.emotion ?? '');
    setTags(activeEntry?.tags ?? []);
  }, [activeId, activeEntry]);

  async function handleSave() {
    if (!active || !selected) return;
    setSaving(true);
    try {
      const body = { body: note, emotion: emotion || undefined, tags, tradeId: active.positionId, brokerAccountId: selected.id };
      const saved = activeEntry ? await api.journal.update(activeEntry.id, body) : await api.journal.create(body);
      setJournalEntries(prev => [...prev.filter(e => e.id !== saved.id), saved]);
    } finally {
      setSaving(false);
    }
  }

  function commitTagDraft() {
    const t = tagDraft?.trim();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagDraft(null);
  }

  function onConnected(a: BrokerAccount) {
    setAccounts(prev => prev.find(x => x.id === a.id) ? prev.map(x => x.id === a.id ? a : x) : [a, ...prev]);
    select(a); setShowConnect(false);
  }

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={select}
      onConnectClick={() => setShowConnect(true)}
      pageTitle="Chart Replay"
      pageSubtitle="// FORENSIC AUDIT"
    >
      {error && (
        <div className="border border-loss/30 bg-loss/10 mx-2 sm:mx-3 lg:mx-4 mt-2 sm:mt-3 lg:mt-4 px-4 py-3 flex items-center justify-between gap-3 text-[12px]" data-testid="journal-error">
          <span className="text-loss">{error}</span>
          <button onClick={() => selected && loadTrades(selected)} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-2 sm:gap-3 p-2 sm:p-3 lg:p-4 fade-up" data-testid="chart-replay-page">
        {/* Center: chart — first on mobile, middle on desktop */}
        <section className="order-1 lg:order-2 col-span-12 lg:col-span-6 flex flex-col gap-2 sm:gap-3">
          <div className="tcard p-0 flex-1">
            <div className="px-3 sm:px-4 py-3 border-b border-border-soft flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
                <span className="font-display font-black text-[16px] sm:text-[18px] tracking-tighter" data-testid="candle-chart-symbol">{active?.symbol ?? '—'}</span>
                <span className={`text-[10px] sm:text-[11px] tracking-widest ${active?.direction === 'LONG' ? 'text-profit' : 'text-loss'}`}>
                  {active?.direction} · {active?.volume.toFixed(2)} LOTS
                </span>
                <span className={`text-[10px] sm:text-[11px] numeric ${active && active.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>
                  {active ? `${active.netPnl >= 0 ? '+' : ''}$${active.netPnl.toFixed(2)}` : ''}
                </span>
              </div>
              <span className="text-[9px] tracking-[0.2em] text-fg-3 border border-border-soft px-2 py-1" title="Illustrative price path reconstructed from entry/exit fills — not tick data">
                SCHEMATIC · NOT TICK DATA
              </span>
            </div>
            <div className="h-[280px] sm:h-[360px] lg:h-[460px]"><CandleChart trade={active} /></div>
            <div className="px-3 sm:px-4 py-3 border-t border-border-soft grid grid-cols-2 sm:grid-cols-4 gap-3 text-[11px]">
              <div>
                <div className="text-[10px] tracking-widest text-fg-3">ENTRY</div>
                <div className="numeric mt-0.5">{active?.entryPrice.toFixed(active?.symbol === 'USDJPY' ? 3 : 5)}</div>
              </div>
              <div>
                <div className="text-[10px] tracking-widest text-fg-3">EXIT</div>
                <div className="numeric mt-0.5">{active?.exitPrice?.toFixed(active?.symbol === 'USDJPY' ? 3 : 5)}</div>
              </div>
              <div>
                <div className="text-[10px] tracking-widest text-fg-3">HELD</div>
                <div className="numeric mt-0.5">{fmtDur(active?.durationSecs ?? null)}</div>
              </div>
              <div>
                <div className="text-[10px] tracking-widest text-fg-3">COMMISSION</div>
                <div className="numeric mt-0.5 text-fg-2">${active?.commission.toFixed(2)}</div>
              </div>
            </div>
          </div>
        </section>

        {/* Left: trade list — second on mobile */}
        <aside className="order-2 lg:order-1 tcard col-span-12 lg:col-span-3 p-0 max-h-[420px] lg:max-h-[calc(100vh-120px)] overflow-y-auto" data-testid="trade-list">
          <div className="px-4 py-3 border-b border-border-soft flex items-center justify-between sticky top-0 bg-app z-10">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">POSITION_LOG</div>
            <span className="text-[10px] text-fg-3 numeric">{trades.length}</span>
          </div>
          {trades.map(t => {
            const rowActive = t.positionId === activeId;
            const pos = t.netPnl >= 0;
            return (
              <button
                key={t.positionId}
                onClick={() => setActiveId(t.positionId)}
                data-testid={`trade-row-${t.positionId}`}
                className={`w-full text-left px-4 py-3 border-b border-border-soft transition-colors ${rowActive ? 'bg-surface border-l-2 border-l-profit pl-[14px]' : 'hover:bg-surface-hover'}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-bold tracking-tight text-[14px]">{t.symbol}</span>
                  <span className={`text-[11px] numeric font-medium ${pos ? 'text-profit' : 'text-loss'}`}>
                    {pos ? '+' : ''}${t.netPnl.toFixed(2)}
                  </span>
                </div>
                <div className="flex items-center justify-between mt-1 text-[10px] text-fg-3 tracking-widest numeric">
                  <span>{t.direction} · {t.volume.toFixed(2)} LOTS</span>
                  <span>{new Date(t.openTime).toLocaleDateString('en-US', { day: '2-digit', month: 'short' })}</span>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Right: journal panel — third on mobile */}
        <aside className="order-3 tcard col-span-12 lg:col-span-3 p-0 flex flex-col" data-testid="journal-panel">
          <div className="px-4 py-3 border-b border-border-soft">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">JOURNAL_ENTRY</div>
            <div className="font-display font-bold text-[15px] tracking-tight mt-1">Trade notes</div>
          </div>

          <div className="p-4 flex flex-col gap-4 flex-1 overflow-y-auto">
            <div>
              <div className="text-[10px] tracking-widest text-fg-3 mb-2">EMOTION TAG</div>
              <div className="flex flex-wrap gap-1.5">
                {['Disciplined', 'Confident', 'Patient', 'FOMO', 'Revenge', 'Hesitant'].map(e => (
                  <button
                    key={e}
                    onClick={() => setEmotion(e)}
                    data-testid={`emotion-${e.toLowerCase()}`}
                    className={`px-2.5 py-1 rounded text-[10px] tracking-widest border transition-colors duration-[var(--dur-hover)] press focus-ring ${
                      emotion === e
                        ? (['FOMO', 'Revenge', 'Hesitant'].includes(e) ? 'bg-loss/15 border-loss text-loss' : 'bg-profit/15 border-profit text-profit')
                        : 'border-border-soft text-fg-3 hover:text-fg hover:border-border-strong'
                    }`}
                  >
                    {e.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="text-[10px] tracking-widest text-fg-3 mb-2">SETUP TAGS</div>
              <div className="flex flex-wrap gap-1.5">
                {tags.map(t => (
                  <button
                    key={t}
                    onClick={() => setTags(prev => prev.filter(x => x !== t))}
                    data-testid={`tag-${t.toLowerCase()}`}
                    title="Remove tag"
                    className="px-2 py-1 rounded text-[10px] tracking-widest border border-border-soft text-fg-2 hover:border-loss hover:text-loss transition-colors duration-[var(--dur-hover)] press focus-ring"
                  >
                    {t.toUpperCase()}
                  </button>
                ))}
                {tagDraft !== null ? (
                  <input
                    autoFocus
                    value={tagDraft}
                    onChange={e => setTagDraft(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') commitTagDraft();
                      if (e.key === 'Escape') setTagDraft(null);
                    }}
                    onBlur={commitTagDraft}
                    data-testid="tag-draft-input"
                    placeholder="Tag name…"
                    className="px-2 py-1 text-[10px] tracking-widest border border-border-strong bg-transparent text-fg w-24 focus:outline-none"
                  />
                ) : (
                  <button onClick={() => setTagDraft('')} data-testid="add-tag" className="px-2 py-1 text-[10px] tracking-widest border border-dashed border-border-strong text-fg-3 hover:text-fg">+ ADD</button>
                )}
              </div>
            </div>

            <div className="flex-1 flex flex-col">
              <div className="text-[10px] tracking-widest text-fg-3 mb-2">PRE/POST NOTES</div>
              <textarea
                value={note}
                onChange={e => setNote(e.target.value)}
                data-testid="journal-note"
                className="tinput flex-1 min-h-[140px] resize-none leading-relaxed"
              />
            </div>

            <div className="pt-2 border-t border-border-soft">
              <button
                onClick={handleSave}
                disabled={saving || !active}
                data-testid="save-journal"
                className={`btn btn-primary w-full justify-center py-2.5 text-[10px] tracking-[0.22em] ${saving || !active ? 'opacity-70 cursor-wait' : ''}`}
              >
                {saving ? 'SAVING…' : 'SAVE ENTRY'}
              </button>
            </div>
          </div>
        </aside>
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
