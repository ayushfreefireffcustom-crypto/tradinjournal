'use client';

import { Fragment } from 'react';
import { useEffect, useState, useCallback, useMemo } from 'react';
import {
  DndContext, closestCenter, PointerSensor, KeyboardSensor, TouchSensor,
  useSensor, useSensors, type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext, sortableKeyboardCoordinates, arrayMove, rectSortingStrategy,
} from '@dnd-kit/sortable';
import { api, type BrokerAccount, type AccountStats, type Trade, type JournalEntry } from '@/lib/api';
import { statsForRange, rangeStart, RANGES, type RangeKey } from '@/lib/stats';
import AppShell from '@/components/app-shell';
import ConnectBrokerModal from '@/components/connect-broker-modal';
import EquityChart from '@/components/equity-chart';
import SortableCard from '@/components/sortable-card';
import RollingChart from '@/components/rolling-chart';
import ScatterChart from '@/components/scatter-chart';
import YearHeatmap from '@/components/year-heatmap';
import { useToast } from '@/components/toast';
import InsightsStrip from '@/components/insights-strip';

// Rearrangeable analytics blocks. Order is persisted per-account in localStorage.
// Spans are chosen so the default order tiles the 12-col grid cleanly; when the
// user reorders, CSS grid auto-flow keeps rows filled left-to-right.
const BLOCK_IDS = ['donut', 'pnldist', 'heatmap', 'timeofday', 'equity', 'rolling', 'scatter', 'yearheat', 'bysymbol', 'tag', 'emotion', 'byday'] as const;
type BlockId = (typeof BLOCK_IDS)[number];
const DEFAULT_ORDER: BlockId[] = ['donut', 'pnldist', 'equity', 'rolling', 'scatter', 'heatmap', 'timeofday', 'yearheat', 'bysymbol', 'tag', 'emotion', 'byday'];
const SPANS: Record<BlockId, string> = {
  donut: 'col-span-12 lg:col-span-5',
  pnldist: 'col-span-12 lg:col-span-7',
  heatmap: 'col-span-12 lg:col-span-5',
  timeofday: 'col-span-12 lg:col-span-7',
  equity: 'col-span-12',
  rolling: 'col-span-12 lg:col-span-6',
  scatter: 'col-span-12 lg:col-span-6',
  yearheat: 'col-span-12',
  bysymbol: 'col-span-12',
  tag: 'col-span-12 lg:col-span-6',
  emotion: 'col-span-12 lg:col-span-6',
  byday: 'col-span-12',
};
const orderKey = (accountId: string) => `tradelogs.analytics.order.${accountId}`;
function sameOrder(a: BlockId[], b: BlockId[]) { return a.length === b.length && a.every((x, i) => x === b[i]); }
function normalizeOrder(saved: string[]): BlockId[] {
  const known = saved.filter((id): id is BlockId => (BLOCK_IDS as readonly string[]).includes(id));
  return [...known, ...DEFAULT_ORDER.filter(id => !known.includes(id))];
}

interface GroupAgg { label: string; trades: number; wins: number; netPnl: number }
interface GroupStat extends GroupAgg { winRate: number; avgPnl: number }

// A compact table of P&L grouped by some dimension (tag / emotion).
function GroupStatCard({
  title, subtitle, rows, colLabel, emptyHint, negativeLabels = [], testId,
}: {
  title: string; subtitle: string; rows: GroupStat[]; colLabel: string;
  emptyHint: string; negativeLabels?: string[]; testId?: string;
}) {
  return (
    <div className="tcard p-5" data-testid={testId}>
      <div className="text-[10px] tracking-[0.25em] text-fg-3">{title}</div>
      <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-4">{subtitle}</div>
      {rows.length === 0 ? (
        <div className="text-fg-3 text-[12px] py-6 text-center">{emptyHint}</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[420px] text-[12px]">
            <thead>
              <tr className="border-b border-border">
                {[colLabel, 'Trades', 'Win Rate', 'Net P&L', 'Avg P&L'].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-[10px] tracking-[0.2em] text-fg-3 uppercase font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => {
                const neg = negativeLabels.includes(r.label);
                return (
                  <tr key={r.label} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                    <td className="px-2 py-2.5">
                      <span className={`px-2 py-0.5 text-[10px] tracking-widest border ${neg ? 'text-loss border-loss/30' : 'text-fg-2 border-border-soft'}`}>
                        {r.label.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-2 py-2.5 numeric text-fg-2">{r.trades}</td>
                    <td className="px-2 py-2.5">
                      <span className={`numeric ${r.winRate >= 0.5 ? 'text-profit' : 'text-loss'}`}>{(r.winRate * 100).toFixed(0)}%</span>
                    </td>
                    <td className={`px-2 py-2.5 numeric font-medium ${r.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{r.netPnl >= 0 ? '+' : ''}${r.netPnl.toFixed(2)}</td>
                    <td className={`px-2 py-2.5 numeric ${r.avgPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{r.avgPnl >= 0 ? '+' : ''}${r.avgPnl.toFixed(2)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function stdev(xs: number[]): number {
  if (xs.length === 0) return 0;
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length;
  return Math.sqrt(v);
}

function moneyShort(v: number): string {
  const sign = v < 0 ? '-' : '';
  const a = Math.abs(v);
  if (a >= 1000) return `${sign}$${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`;
  return `${sign}$${Math.round(a)}`;
}

function Donut({ wins, losses }: { wins: number; losses: number }) {
  const total = wins + losses;
  if (total === 0) return <div className="text-fg-3 text-[12px]">No closed trades</div>;
  const winPct = (wins / total) * 100;
  const R = 56;
  const circ = 2 * Math.PI * R;
  const winDash = (winPct / 100) * circ;
  return (
    <div className="flex flex-col sm:flex-row items-center sm:items-center gap-5 sm:gap-6">
      <svg width={140} height={140} viewBox="0 0 140 140" className="shrink-0" data-testid="winloss-donut">
        <circle cx={70} cy={70} r={R} fill="none" stroke="#FE3A31" strokeWidth={14} />
        <circle
          cx={70} cy={70} r={R} fill="none" stroke="#08C465" strokeWidth={14}
          strokeDasharray={`${winDash} ${circ}`} strokeDashoffset={circ * 0.25}
          transform="rotate(-90 70 70)"
        />
        <text x={70} y={68} textAnchor="middle" style={{ fontFamily: 'var(--font-display)' }} fontWeight={900} fontSize="28" fill="#fff">{winPct.toFixed(0)}%</text>
        <text x={70} y={88} textAnchor="middle" style={{ fontFamily: 'var(--font-mono)' }} fontSize="9" letterSpacing="2" fill="#71717A">WIN RATE</text>
      </svg>
      <div className="flex flex-col gap-2 text-[12px] w-full sm:w-auto sm:min-w-[160px]">
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-profit" /><span className="text-fg-2">Wins</span><span className="ml-auto font-mono numeric">{wins}</span></div>
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 bg-loss" /><span className="text-fg-2">Losses</span><span className="ml-auto font-mono numeric">{losses}</span></div>
        <div className="flex items-center gap-2"><span className="w-2.5 h-2.5 border border-border-strong" /><span className="text-fg-2">Total</span><span className="ml-auto font-mono numeric">{total}</span></div>
      </div>
    </div>
  );
}

function HBars({ data, maxLabelWidth = 56 }: { data: { label: string; value: number }[]; maxLabelWidth?: number }) {
  const max = Math.max(...data.map(d => Math.abs(d.value)), 1);
  return (
    <div className="flex flex-col gap-2.5">
      {data.map(d => {
        const pos = d.value >= 0;
        const w = (Math.abs(d.value) / max) * 100;
        return (
          <div key={d.label} className="flex items-center gap-2 sm:gap-3 text-[11px] sm:text-[12px]">
            <span className="text-fg-3 text-[10px] tracking-widest uppercase text-right shrink-0" style={{ width: maxLabelWidth }}>{d.label}</span>
            <div className="flex-1 h-5 bg-surface-hover relative min-w-0">
              <div className="h-full transition-all" style={{ width: `${w}%`, background: pos ? '#08C465' : '#FE3A31', opacity: 0.85 }} />
            </div>
            <span className={`numeric font-medium shrink-0 ${pos ? 'text-profit' : 'text-loss'}`} style={{ width: 72, textAlign: 'right' }}>
              {pos ? '+' : ''}${d.value.toFixed(2)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function PnlDist({ trades }: { trades: Trade[] }) {
  // Real per-trade net P&L distribution (symmetric $ buckets around break-even).
  const pnls = trades.filter(t => t.status === 'CLOSED').map(t => t.netPnl);
  if (pnls.length === 0) return <div className="text-fg-3 text-[12px]">No closed trades yet.</div>;

  const N = 8;
  const absMax = Math.max(...pnls.map(v => Math.abs(v)), 1);
  const lo = -absMax;
  const width = (2 * absMax) / N;
  const buckets = Array.from({ length: N }, (_, i) => {
    const center = lo + (i + 0.5) * width;
    return { l: moneyShort(center), v: 0, loss: center < 0 };
  });
  for (const v of pnls) {
    let idx = Math.floor((v - lo) / width);
    if (idx < 0) idx = 0; else if (idx >= N) idx = N - 1;
    buckets[idx]!.v += 1;
  }
  const total = pnls.length;
  const mode = buckets.reduce((m, b) => (b.v > m.v ? b : m), buckets[0]!);
  const maxV = Math.max(...buckets.map(b => b.v), 1);
  const zeroIdx = 3; // break-even sits on the boundary between bucket 3 and 4
  const expectancy = pnls.reduce((s, v) => s + v, 0) / total;
  const sd = stdev(pnls);
  const best = Math.max(...pnls);
  const worst = Math.min(...pnls);

  const W = 700, H = 240;
  const PAD = { top: 26, right: 14, bottom: 38, left: 14 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const gap = 8;
  const bw = (innerW - gap * (buckets.length - 1)) / buckets.length;
  const scaleY = (v: number) => (v / maxV) * innerH;

  // Gradient definitions for bars
  return (
    <div data-testid="r-distribution">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="barLoss" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#FE3A31" stopOpacity="1" />
            <stop offset="100%" stopColor="#FE3A31" stopOpacity="0.25" />
          </linearGradient>
          <linearGradient id="barProfit" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#08C465" stopOpacity="1" />
            <stop offset="100%" stopColor="#08C465" stopOpacity="0.25" />
          </linearGradient>
        </defs>

        {/* horizontal grid lines */}
        {[0.25, 0.5, 0.75, 1].map(p => (
          <line key={p} x1={PAD.left} x2={W - PAD.right} y1={PAD.top + innerH - innerH * p} y2={PAD.top + innerH - innerH * p} stroke="#1E1E1E" strokeDasharray="2 5" />
        ))}

        {/* Bars */}
        {buckets.map((b, i) => {
          const x = PAD.left + i * (bw + gap);
          const h = scaleY(b.v);
          const y = PAD.top + innerH - h;
          const fill = b.loss ? 'url(#barLoss)' : 'url(#barProfit)';
          const stroke = b.loss ? '#FE3A31' : '#08C465';
          return (
            <g key={b.l}>
              {/* Bar */}
              <rect x={x} y={y} width={bw} height={h} fill={fill} />
              {/* Top edge accent */}
              <line x1={x} x2={x + bw} y1={y} y2={y} stroke={stroke} strokeWidth="1.5" />
              {/* Value label above bar */}
              <text x={x + bw / 2} y={y - 8} textAnchor="middle" fontSize="11" style={{ fontFamily: 'var(--font-mono)' }} fill="#A1A1AA">
                {b.v}
              </text>
              {/* X-axis label */}
              <text x={x + bw / 2} y={H - 18} textAnchor="middle" fontSize="10" style={{ fontFamily: 'var(--font-mono)' }} letterSpacing="1" fill={b.loss ? '#71717A' : '#A1A1AA'}>
                {b.l}
              </text>
              {/* Percentage of sample under label */}
              <text x={x + bw / 2} y={H - 5} textAnchor="middle" fontSize="9" style={{ fontFamily: 'var(--font-mono)' }} fill="#4A4A4A">
                {Math.round((b.v / total) * 100)}%
              </text>
            </g>
          );
        })}

        {/* Zero (break-even) line between losing and winning R buckets */}
        <line
          x1={PAD.left + (zeroIdx + 1) * bw + zeroIdx * gap + gap / 2}
          x2={PAD.left + (zeroIdx + 1) * bw + zeroIdx * gap + gap / 2}
          y1={PAD.top - 12}
          y2={PAD.top + innerH + 4}
          stroke="#FFFFFF" strokeDasharray="3 3" opacity="0.35"
        />
        <text
          x={PAD.left + (zeroIdx + 1) * bw + zeroIdx * gap + gap / 2}
          y={PAD.top - 16}
          textAnchor="middle" fontSize="9" letterSpacing="2" style={{ fontFamily: 'var(--font-mono)' }} fill="#71717A"
        >
          BREAK-EVEN
        </text>

      </svg>

      {/* Stats footer */}
      <div className="mt-4 pt-4 border-t border-border-soft grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
        {[
          { l: 'Expectancy', v: `${expectancy >= 0 ? '+' : '-'}$${Math.abs(expectancy).toFixed(2)}`, c: expectancy >= 0 ? 'text-profit' : 'text-loss' },
          { l: 'Std Dev',    v: `$${sd.toFixed(0)}`, c: '' },
          { l: 'Best',       v: `+$${best.toFixed(0)}`, c: 'text-profit' },
          { l: 'Worst',      v: `$${worst.toFixed(0)}`, c: 'text-loss' },
        ].map(s => (
          <div key={s.l}>
            <div className="text-[10px] tracking-[0.22em] text-fg-3 uppercase">{s.l}</div>
            <div className={`font-display font-black text-[18px] sm:text-xl tracking-tight mt-1 numeric ${s.c}`}>{s.v}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px] tracking-widest text-fg-3 numeric">
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 bg-profit" /> WINNERS · {buckets.filter(b => !b.loss).reduce((s, b) => s + b.v, 0)}
        </span>
        <span className="flex items-center gap-2">
          <span className="w-2 h-2 bg-loss" /> LOSERS · {buckets.filter(b => b.loss).reduce((s, b) => s + b.v, 0)}
        </span>
        <span>MODE · {mode.l}</span>
        <span>SAMPLE · {total} TRADES</span>
      </div>
    </div>
  );
}

function SessionHeatmap({ trades }: { trades: Trade[] }) {
  const sessions = ['ASIA', 'LON', 'NY'] as const;
  const days = ['MON', 'TUE', 'WED', 'THU', 'FRI'] as const;
  const closed = trades.filter(t => t.status === 'CLOSED');

  // Net P&L by session (UTC open hour) × weekday.
  const data: number[][] = [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]];
  let mapped = 0;
  for (const t of closed) {
    const d = new Date(t.openTime);
    const wd = d.getUTCDay();          // 0 Sun .. 6 Sat
    if (wd < 1 || wd > 5) continue;    // weekday sessions only
    const h = d.getUTCHours();
    const sIdx = (h < 7 || h >= 22) ? 0 : (h < 13 ? 1 : 2);
    data[sIdx]![wd - 1]! += t.netPnl;
    mapped++;
  }
  if (mapped === 0) return <div className="text-fg-3 text-[12px]">No weekday trades to map.</div>;
  for (let i = 0; i < data.length; i++) {
    for (let j = 0; j < data[i]!.length; j++) data[i]![j] = Math.round(data[i]![j]!);
  }

  const flat = data.flat();
  const max = Math.max(...flat.map(v => Math.abs(v)), 1);
  const rowTotals = data.map(r => r.reduce((s, v) => s + v, 0));
  const colTotals = days.map((_, j) => data.reduce((s, r) => s + r[j]!, 0));
  const total = rowTotals.reduce((s, v) => s + v, 0);

  // Find best cell for callout
  let best = { s: 0, d: 0, v: -Infinity };
  data.forEach((row, i) => row.forEach((v, j) => { if (v > best.v) best = { s: i, d: j, v }; }));

  return (
    <div className="w-full max-w-[520px] mx-auto" data-testid="session-heatmap">
      <div
        className="grid gap-1"
        style={{ gridTemplateColumns: `44px repeat(${days.length}, minmax(0, 1fr)) 60px` }}
      >
        {/* Header row */}
        <div />
        {days.map(d => (
          <div key={d} className="text-center text-[9px] sm:text-[10px] tracking-widest text-fg-3 pb-1">{d}</div>
        ))}
        <div className="text-center text-[9px] sm:text-[10px] tracking-widest text-fg-3 pb-1">TOTAL</div>

        {/* Session rows */}
        {sessions.map((s, i) => (
          <Fragment key={s}>
            <div className="text-[10px] tracking-widest text-fg-3 self-center border-r border-border-soft pr-2">{s}</div>
            {data[i]!.map((v, j) => {
              const pos = v >= 0;
              const intensity = Math.min(1, Math.abs(v) / max);
              const bestCell = best.s === i && best.d === j;
              return (
                <div
                  key={j}
                  className={`h-11 sm:h-12 flex items-center justify-center border transition-colors ${bestCell ? 'border-profit' : 'border-border-soft'}`}
                  style={{
                    background: pos
                      ? `rgba(0, 197, 102, ${0.10 + intensity * 0.55})`
                      : `rgba(255, 59, 48, ${0.10 + intensity * 0.55})`,
                  }}
                >
                  <span className={`text-[10px] sm:text-[11px] numeric font-medium ${pos ? 'text-profit' : 'text-loss'}`}>
                    {pos ? '+' : ''}{v}
                  </span>
                </div>
              );
            })}
            {/* Row total */}
            <div className="h-11 sm:h-12 flex items-center justify-center border border-border-soft bg-surface-hover">
              <span className={`text-[11px] numeric font-semibold ${rowTotals[i]! >= 0 ? 'text-profit' : 'text-loss'}`}>
                {rowTotals[i]! >= 0 ? '+' : ''}{rowTotals[i]}
              </span>
            </div>
          </Fragment>
        ))}

        {/* Column totals row */}
        <div className="text-[10px] tracking-widest text-fg-3 self-center border-r border-border-soft pr-2 pt-1">TOT</div>
        {colTotals.map((v, j) => (
          <div key={j} className="h-9 flex items-center justify-center border border-border-soft bg-surface-hover">
            <span className={`text-[10px] sm:text-[11px] numeric font-semibold ${v >= 0 ? 'text-profit' : 'text-loss'}`}>
              {v >= 0 ? '+' : ''}{v}
            </span>
          </div>
        ))}
        <div className="h-9 flex items-center justify-center border border-fg bg-fg text-app">
          <span className="text-[11px] numeric font-bold">{total >= 0 ? '+' : ''}{total}</span>
        </div>
      </div>

      {/* Callouts */}
      <div className="mt-5 pt-4 border-t border-border-soft grid grid-cols-2 gap-3">
        <div className="border-l-2 border-profit pl-3">
          <div className="text-[9px] tracking-[0.22em] text-fg-3 uppercase">BEST SESSION</div>
          <div className="mt-1 font-display font-bold text-[13px] tracking-tight">{sessions[best.s]} · {days[best.d]}</div>
          <div className="text-[11px] text-profit numeric">+${best.v}</div>
        </div>
        <div className="border-l-2 border-loss pl-3">
          <div className="text-[9px] tracking-[0.22em] text-fg-3 uppercase">WORST SESSION</div>
          {(() => {
            let worst = { s: 0, d: 0, v: Infinity };
            data.forEach((row, i) => row.forEach((v, j) => { if (v < worst.v) worst = { s: i, d: j, v }; }));
            return (
              <>
                <div className="mt-1 font-display font-bold text-[13px] tracking-tight">{sessions[worst.s]} · {days[worst.d]}</div>
                <div className="text-[11px] text-loss numeric">${worst.v}</div>
              </>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

function TimeOfDay({ trades }: { trades: Trade[] }) {
  const closed = trades.filter(t => t.status === 'CLOSED');
  if (closed.length === 0) return <div className="text-fg-3 text-[12px]">No closed trades yet.</div>;

  const net = new Array(24).fill(0) as number[];
  const count = new Array(24).fill(0) as number[];
  for (const t of closed) {
    const h = new Date(t.openTime).getUTCHours();
    net[h]! += t.netPnl;
    count[h]! += 1;
  }
  const maxAbs = Math.max(...net.map(v => Math.abs(v)), 1);
  let bestH = 0, worstH = 0, busyH = 0;
  for (let h = 0; h < 24; h++) {
    if (net[h]! > net[bestH]!) bestH = h;
    if (net[h]! < net[worstH]!) worstH = h;
    if (count[h]! > count[busyH]!) busyH = h;
  }
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;

  const W = 720, H = 220;
  const PAD = { top: 16, right: 12, bottom: 26, left: 12 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const mid = PAD.top + innerH / 2;
  const gap = 4;
  const bw = (innerW - gap * 23) / 24;
  const scale = (v: number) => (v / maxAbs) * (innerH / 2);

  return (
    <div data-testid="time-of-day">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" preserveAspectRatio="none">
        <line x1={PAD.left} x2={W - PAD.right} y1={mid} y2={mid} stroke="#4A4A4A" strokeWidth="1" />
        {net.map((v, h) => {
          const x = PAD.left + h * (bw + gap);
          const barH = Math.abs(scale(v));
          const y = v >= 0 ? mid - barH : mid;
          const pos = v >= 0;
          return (
            <g key={h}>
              {count[h]! > 0 && <rect x={x} y={y} width={bw} height={Math.max(1, barH)} fill={pos ? '#08C465' : '#FE3A31'} opacity="0.85" />}
              {h % 3 === 0 && (
                <text x={x + bw / 2} y={H - 8} textAnchor="middle" fontSize="9" style={{ fontFamily: 'var(--font-mono)' }} fill="#71717A">{String(h).padStart(2, '0')}</text>
              )}
            </g>
          );
        })}
      </svg>
      <div className="mt-3 pt-3 border-t border-border-soft grid grid-cols-3 gap-3 text-[11px]">
        <div>
          <div className="text-[9px] tracking-[0.22em] text-fg-3 uppercase">Best hour</div>
          <div className="font-display font-bold text-[15px] tracking-tight mt-0.5 numeric text-profit">{hh(bestH)}</div>
        </div>
        <div>
          <div className="text-[9px] tracking-[0.22em] text-fg-3 uppercase">Worst hour</div>
          <div className="font-display font-bold text-[15px] tracking-tight mt-0.5 numeric text-loss">{hh(worstH)}</div>
        </div>
        <div>
          <div className="text-[9px] tracking-[0.22em] text-fg-3 uppercase">Most active</div>
          <div className="font-display font-bold text-[15px] tracking-tight mt-0.5 numeric text-fg">{hh(busyH)}</div>
        </div>
      </div>
    </div>
  );
}

export default function AnalyticsPage() {
  const [accounts, setAccounts] = useState<BrokerAccount[]>([]);
  const [selected, setSelected] = useState<BrokerAccount | null>(null);
  const [stats, setStats] = useState<AccountStats | null>(null);
  const [trades, setTrades] = useState<Trade[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [range, setRange] = useState<RangeKey>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showConnect, setShowConnect] = useState(false);
  const [order, setOrder] = useState<BlockId[]>(DEFAULT_ORDER);
  const toast = useToast();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // Load persisted card order whenever the active account changes.
  useEffect(() => {
    if (!selected) return;
    try {
      const raw = localStorage.getItem(orderKey(selected.id));
      setOrder(raw ? normalizeOrder(JSON.parse(raw)) : DEFAULT_ORDER);
    } catch { setOrder(DEFAULT_ORDER); }
  }, [selected]);

  const persistOrder = useCallback((next: BlockId[]) => {
    setOrder(next);
    if (selected) { try { localStorage.setItem(orderKey(selected.id), JSON.stringify(next)); } catch {} }
  }, [selected]);

  const onDragEnd = useCallback((e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setOrder(prev => {
      const oldIndex = prev.indexOf(active.id as BlockId);
      const newIndex = prev.indexOf(over.id as BlockId);
      if (oldIndex < 0 || newIndex < 0) return prev;
      const next = arrayMove(prev, oldIndex, newIndex);
      if (selected) { try { localStorage.setItem(orderKey(selected.id), JSON.stringify(next)); } catch {} }
      return next;
    });
  }, [selected]);

  const isDefaultOrder = sameOrder(order, DEFAULT_ORDER);

  const init = useCallback(async () => {
    try {
      const accs = await api.accounts.list();
      setAccounts(accs);
      setSelected(accs[0] ?? null);
    } catch {}
  }, []);
  useEffect(() => { init(); }, [init]);

  const loadStats = useCallback(async (acc: BrokerAccount) => {
    setLoading(true);
    setError('');
    try {
      const [s, t, j] = await Promise.all([
        api.trades.stats(acc.id),
        api.trades.list(acc.id),
        api.journal.list(acc.id),
      ]);
      setStats(s);
      setTrades(t);
      setJournal(j);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load account data');
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (selected) loadStats(selected); }, [selected, loadStats]);

  // Range-filtered view: recompute every widget's stats from the selected range.
  const view = useMemo(
    () => (stats ? statsForRange(trades, stats.startingBalance, range) : null),
    [stats, trades, range],
  );

  // Closed trades within the selected range (for distribution / heatmap / tags).
  const rangedTrades = useMemo(() => {
    const start = rangeStart(range);
    return trades.filter(t => t.status === 'CLOSED' && t.closeTime && (start === null || new Date(t.closeTime).getTime() >= start));
  }, [trades, range]);

  // Group closed-trade P&L by the tags / emotion logged for each trade's
  // journal entry (joined by tradeId → positionId), within the selected range.
  const { tagStats, emotionStats } = useMemo(() => {
    const closedById = new Map<string, Trade>();
    for (const t of rangedTrades) closedById.set(t.positionId, t);

    const tagMap = new Map<string, GroupAgg>();
    const emoMap = new Map<string, GroupAgg>();
    const bump = (map: Map<string, GroupAgg>, key: string, netPnl: number) => {
      const g = map.get(key) ?? { label: key, trades: 0, wins: 0, netPnl: 0 };
      g.trades += 1;
      if (netPnl > 0) g.wins += 1;
      g.netPnl += netPnl;
      map.set(key, g);
    };

    for (const e of journal) {
      if (!e.tradeId) continue;
      const t = closedById.get(e.tradeId);
      if (!t) continue;
      if (e.emotion) bump(emoMap, e.emotion, t.netPnl);
      for (const tag of e.tags ?? []) bump(tagMap, tag, t.netPnl);
    }

    const finalize = (map: Map<string, GroupAgg>): GroupStat[] =>
      Array.from(map.values())
        .map(g => ({ ...g, winRate: g.trades ? g.wins / g.trades : 0, avgPnl: g.trades ? g.netPnl / g.trades : 0 }))
        .sort((a, b) => b.netPnl - a.netPnl);

    return { tagStats: finalize(tagMap), emotionStats: finalize(emoMap) };
  }, [rangedTrades, journal]);

  function onConnected(account: BrokerAccount) {
    setAccounts(prev => prev.find(a => a.id === account.id) ? prev.map(a => a.id === account.id ? account : a) : [account, ...prev]);
    setSelected(account);
    setShowConnect(false);
  }

  // Inner content for each rearrangeable block. The outer col-span + drag handle
  // are supplied by <SortableCard>; here we render just the card body.
  function renderBlock(id: BlockId) {
    if (!view) return null;
    switch (id) {
      case 'donut':
        return (
          <div className="tcard h-full p-5">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">WIN_LOSS_RATIO</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">Strike rate</div>
            <Donut wins={view.totalWins} losses={view.totalLosses} />
            <div className="grid grid-cols-2 gap-3 mt-6 pt-5 border-t border-border-soft">
              {[
                { l: 'Avg Win', v: `+$${view.avgWin.toFixed(2)}`, c: 'text-profit' },
                { l: 'Avg Loss', v: `$${view.avgLoss.toFixed(2)}`, c: 'text-loss' },
                { l: 'Best Trade', v: `+$${view.bestTrade.toFixed(2)}`, c: 'text-profit' },
                { l: 'Worst Trade', v: `$${view.worstTrade.toFixed(2)}`, c: 'text-loss' },
              ].map(m => (
                <div key={m.l}>
                  <div className="text-[10px] tracking-[0.18em] text-fg-3 uppercase">{m.l}</div>
                  <div className={`font-display font-bold text-[18px] tracking-tight mt-0.5 numeric ${m.c}`}>{m.v}</div>
                </div>
              ))}
            </div>
          </div>
        );
      case 'byday':
        return (
          <div className="tcard h-full p-5">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">PNL_BY_DAY</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">Day of week distribution</div>
            <HBars data={view.byDay.map(d => ({ label: d.day, value: d.netPnl }))} />
          </div>
        );
      case 'pnldist':
        return (
          <div className="tcard h-full p-5">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">PNL_DISTRIBUTION</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">Net P&L per trade</div>
            <PnlDist trades={rangedTrades} />
          </div>
        );
      case 'heatmap':
        return (
          <div className="tcard h-full p-5">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">SESSION_HEATMAP</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">P&L by session × weekday · UTC</div>
            <SessionHeatmap trades={rangedTrades} />
          </div>
        );
      case 'timeofday':
        return (
          <div className="tcard h-full p-5">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">TIME_OF_DAY</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-5">Net P&L by hour · UTC open</div>
            <TimeOfDay trades={rangedTrades} />
          </div>
        );
      case 'equity':
        return (
          <div className="tcard h-full p-5" data-testid="dd-card">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-[10px] tracking-[0.25em] text-fg-3">EQUITY_CURVE</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1">Realised equity vs starting balance</div>
              </div>
              <span className="text-[10px] tracking-widest text-fg-3 border border-border-soft px-2 py-1">
                PEAK ${Math.max(...view.equityCurve.map(e => e.equity)).toLocaleString()}
              </span>
            </div>
            <div className="mt-4">
              <EquityChart data={view.equityCurve} height={260} startingBalance={view.startingBalance} />
            </div>
          </div>
        );
      case 'rolling':
        return (
          <div className="tcard h-full p-5">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">ROLLING_EDGE</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-4">Rolling win-rate & expectancy · 20-trade</div>
            <RollingChart trades={rangedTrades} window={20} height={220} />
          </div>
        );
      case 'scatter':
        return (
          <div className="tcard h-full p-5">
            <div className="text-[10px] tracking-[0.25em] text-fg-3">TRADE_SCATTER</div>
            <div className="font-display font-bold text-[16px] tracking-tight mt-1 mb-4">P&L per trade</div>
            <ScatterChart trades={rangedTrades} height={240} />
          </div>
        );
      case 'yearheat':
        return <YearHeatmap trades={trades} />;
      case 'bysymbol':
        return (
          <div className="tcard h-full p-0">
            <div className="px-5 py-4 border-b border-border-soft flex items-center justify-between">
              <div>
                <div className="text-[10px] tracking-[0.25em] text-fg-3">PERFORMANCE_BY_SYMBOL</div>
                <div className="font-display font-bold text-[16px] tracking-tight mt-1">Instrument analytics</div>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-[12px]">
                <thead>
                  <tr className="border-b border-border">
                    {['Symbol', 'Trades', 'Wins', 'Losses', 'Win Rate', 'Net P&L', 'Avg P&L'].map(h => (
                      <th key={h} className="px-5 py-2.5 text-left text-[10px] tracking-[0.22em] text-fg-3 uppercase font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {view.bySymbol.map(s => (
                    <tr key={s.symbol} className="border-b border-border-soft hover:bg-surface-hover transition-colors">
                      <td className="px-5 py-3 font-display font-bold tracking-tight">{s.symbol}</td>
                      <td className="px-5 py-3 numeric text-fg-2">{s.trades}</td>
                      <td className="px-5 py-3 numeric text-profit">{s.wins}</td>
                      <td className="px-5 py-3 numeric text-loss">{s.losses}</td>
                      <td className="px-5 py-3">
                        <span className={`px-2 py-0.5 text-[10px] tracking-widest border ${s.winRate >= 0.5 ? 'text-profit border-profit/30 bg-profit/10' : 'text-loss border-loss/30 bg-loss/10'}`}>
                          {(s.winRate * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className={`px-5 py-3 numeric font-medium ${s.netPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{s.netPnl >= 0 ? '+' : ''}${s.netPnl.toFixed(2)}</td>
                      <td className={`px-5 py-3 numeric ${s.avgPnl >= 0 ? 'text-profit' : 'text-loss'}`}>{s.avgPnl >= 0 ? '+' : ''}${s.avgPnl.toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        );
      case 'tag':
        return (
          <GroupStatCard
            testId="perf-by-tag"
            title="PERFORMANCE_BY_TAG"
            subtitle="Setup edge"
            colLabel="Tag"
            rows={tagStats}
            emptyHint="No tagged trades yet — add setup tags in Chart Replay or Journal to unlock this."
          />
        );
      case 'emotion':
        return (
          <GroupStatCard
            testId="perf-by-emotion"
            title="PERFORMANCE_BY_EMOTION"
            subtitle="Psychology edge"
            colLabel="Emotion"
            rows={emotionStats}
            negativeLabels={['FOMO', 'Revenge', 'Hesitant']}
            emptyHint="No emotions logged yet — tag your trades' emotion to unlock this."
          />
        );
    }
  }

  return (
    <AppShell
      accounts={accounts}
      selectedAccount={selected}
      onSelectAccount={setSelected}
      onConnectClick={() => setShowConnect(true)}
      pageTitle="Analytics"
      pageSubtitle="// EDGE DISCOVERY"
    >
      <div className="p-4 sm:p-6 lg:p-8 max-w-[1400px] mx-auto fade-up" data-testid="analytics-page">
        <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-[10px] tracking-[0.25em] text-fg-3">[ ANALYTICS // {range === 'ALL' ? 'ALL TIME' : `LAST ${range}`} ]</div>
            <h1 className="font-display font-black text-3xl sm:text-4xl tracking-tighter mt-2">DISSECT YOUR EDGE.</h1>
          </div>
          <div className="flex gap-1 overflow-x-auto no-scrollbar -mx-1 px-1 w-full sm:w-auto" data-testid="range-selector">
            {RANGES.map(r => (
              <button
                key={r}
                onClick={() => setRange(r)}
                data-testid={`range-${r}`}
                className={`shrink-0 px-3 py-1.5 text-[10px] tracking-[0.22em] border ${range === r ? 'border-fg text-fg bg-surface' : 'border-border-soft text-fg-3 hover:text-fg hover:border-border-strong'}`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        {error && !loading ? (
          <div className="border border-loss/30 bg-loss/10 px-4 py-3 flex items-center justify-between gap-3 text-[12px]" data-testid="analytics-error">
            <span className="text-loss">{error}</span>
            <button onClick={() => selected && loadStats(selected)} className="btn btn-ghost py-1.5 text-[10px] shrink-0">RETRY</button>
          </div>
        ) : loading || !view ? (
          <div className="grid grid-cols-12 gap-3">
            {Array.from({ length: 6 }).map((_, i) => <div key={i} className="col-span-6 lg:col-span-4 h-40 shimmer" />)}
          </div>
        ) : (
          <>
            {/* Top KPI row */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
              {[
                { l: 'NET P&L',        v: `${view.netPnl >= 0 ? '+' : '-'}$${Math.abs(view.netPnl).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, c: view.netPnl >= 0 ? 'text-profit' : 'text-loss' },
                { l: 'PROFIT FACTOR',  v: view.profitFactor >= 999 ? '∞' : view.profitFactor.toFixed(2) },
                { l: 'GROSS PROFIT',   v: `+$${view.grossProfit.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, c: 'text-profit' },
                { l: 'GROSS LOSS',     v: `-$${view.grossLoss.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, c: 'text-loss' },
                { l: 'MAX DD',         v: `${(view.maxDrawdownPct * 100).toFixed(1)}%`, c: view.maxDrawdownPct > 0.1 ? 'text-loss' : '' },
              ].map((k, i) => (
                <div key={k.l} className="tcard tcard-hover p-4 rise" style={{ ['--i' as string]: i }} data-testid={`kpi-${k.l.toLowerCase().replace(/[^a-z]/g, '')}`}>
                  <div className="text-[10px] tracking-[0.22em] text-fg-3 uppercase">{k.l}</div>
                  <div className={`font-display font-black text-2xl sm:text-3xl tracking-tighter mt-3 numeric ${k.c ?? ''}`}>{k.v}</div>
                </div>
              ))}
            </div>

            {/* Auto insights */}
            <InsightsStrip stats={view} trades={rangedTrades} journal={journal} />

            {/* Rearrange toolbar */}
            <div className="flex items-center justify-between gap-3 mb-3" data-testid="analytics-arrange-bar">
              <span className="text-[10px] tracking-[0.2em] text-fg-3 uppercase">Drag the ⠿ handle to rearrange boxes</span>
              {!isDefaultOrder && (
                <button onClick={() => { persistOrder(DEFAULT_ORDER); toast.info('Layout reset to default'); }} className="btn btn-ghost py-1.5 text-[10px]" data-testid="analytics-reset-layout">
                  RESET LAYOUT
                </button>
              )}
            </div>

            {/* Rearrangeable analytics grid */}
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
              <SortableContext items={order} strategy={rectSortingStrategy}>
                <div className="grid grid-cols-12 gap-3" data-testid="analytics-grid">
                  {order.map(id => (
                    <SortableCard key={id} id={id} className={SPANS[id]}>
                      {renderBlock(id)}
                    </SortableCard>
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          </>
        )}
      </div>

      {showConnect && <ConnectBrokerModal onClose={() => setShowConnect(false)} onConnected={onConnected} />}
    </AppShell>
  );
}
