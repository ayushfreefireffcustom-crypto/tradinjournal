'use client';

import { useState } from 'react';
import { CaretDown, CaretUp } from '@phosphor-icons/react';
import { formatMacroNumber, formatAsOf } from '@/lib/macro-format';
import type { TraderAnalysis } from '@/lib/trader-api';
import { OutcomeBadge } from './outcome-badge';

function dirTone(d: string): string {
  if (d === 'LONG') return 'bg-profit/15 text-profit border-profit/25';
  if (d === 'SHORT') return 'bg-loss/15 text-loss border-loss/25';
  return 'bg-white/5 text-fg-2 border-border';
}

function shortRationale(text: string): string {
  const cleaned = text
    .replace(/\s*Not financial advice[^.]*\.?/gi, '')
    .replace(/\s*Lanes\s+\d+%[^.]*\.?/gi, '')
    .trim();
  const sentence = cleaned.split(/(?<=[.!?])\s+/)[0] ?? cleaned;
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence;
}

function Level({
  label,
  children,
  tone,
}: {
  label: string;
  children: React.ReactNode;
  tone?: 'profit' | 'loss' | 'muted';
}) {
  const c =
    tone === 'profit' ? 'text-profit' : tone === 'loss' ? 'text-loss' : tone === 'muted' ? 'text-fg-2' : 'text-fg';
  return (
    <div className="flex items-baseline justify-between gap-3 py-2 border-b border-border last:border-0">
      <span className="text-xs text-fg-3">{label}</span>
      <span className={`text-sm tabular-nums font-medium ${c}`}>{children}</span>
    </div>
  );
}

export default function AnalysisReport({ a }: { a: TraderAnalysis }) {
  const [showDetail, setShowDetail] = useState(false);
  const conf = Math.max(0, Math.min(100, a.confidence));
  const confTone = a.direction === 'LONG' ? 'bg-profit' : a.direction === 'SHORT' ? 'bg-loss' : 'bg-fg-2';

  const isLong = a.direction === 'LONG';
  const isShort = a.direction === 'SHORT';

  return (
    <article
      className="relative overflow-hidden rounded-xl border border-border bg-surface p-4 sm:p-5 animate-[fade-up_0.4s_ease_both]"
      data-testid="trader-report"
    >
      {/* Soft top wash — same weight as the earlier card */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-50"
        style={{
          background: isLong
            ? 'linear-gradient(180deg, color-mix(in oklab, var(--color-profit) 14%, transparent), transparent)'
            : isShort
              ? 'linear-gradient(180deg, color-mix(in oklab, var(--color-loss) 14%, transparent), transparent)'
              : undefined,
        }}
      />

      {/* Header */}
      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-display font-semibold text-xl tracking-tight text-fg">{a.symbol}</h2>
            <span
              className={`text-[11px] font-medium tracking-wide px-2 py-0.5 rounded-md border ${dirTone(a.direction)}`}
              data-testid="trader-direction"
            >
              {a.direction}
            </span>
            <OutcomeBadge outcome={a.outcome} hitLevel={a.hitLevel} pending={!a.outcome && !!a.id} compact />
          </div>
          <p className="mt-1 text-xs text-fg-3 tabular-nums">
            {a.timeframes.join(' · ')} · {formatAsOf(a.asOf)}
          </p>
        </div>
        <div className="text-right shrink-0">
          <div className="text-[10px] uppercase tracking-wider text-fg-3">
            {a.confidenceSource === 'meta_lgbm' ? 'Model' : a.confidenceSource === 'meta_v1' ? 'Meta' : 'Conf'}
          </div>
          <div className="text-lg font-semibold tabular-nums text-fg leading-none">{a.confidence}%</div>
        </div>
      </div>

      <div className="mt-2.5 h-1 rounded-full bg-border overflow-hidden">
        <div
          className={`h-full ${confTone} origin-left animate-[bar-grow-x_0.6s_ease_both]`}
          style={{ width: `${conf}%` }}
        />
      </div>

      {/* Lanes — compact chips, no walls of text */}
      {a.laneBreakdown && a.laneBreakdown.length > 0 && (
        <div className="mt-3.5 flex flex-wrap gap-1.5" data-testid="trader-lanes">
          {a.laneBreakdown.map((lane) => {
            const bull = lane.score > 0.08;
            const bear = lane.score < -0.08;
            return (
              <span
                key={lane.id}
                title={lane.rationale}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] ${
                  bull
                    ? 'border-profit/20 bg-profit/10 text-profit'
                    : bear
                      ? 'border-loss/20 bg-loss/10 text-loss'
                      : 'border-border bg-app text-fg-2'
                }`}
              >
                <span className="uppercase tracking-wider opacity-80">{lane.source ?? lane.id}</span>
                <span className="tabular-nums font-medium">
                  {lane.score > 0 ? '+' : ''}
                  {lane.score.toFixed(2)}
                </span>
                {lane.stale && <span className="text-[9px] uppercase tracking-wider opacity-70">stale</span>}
              </span>
            );
          })}
        </div>
      )}

      {/* Levels */}
      <div className="mt-4 rounded-lg border border-border bg-app/50 px-3">
        <Level label="Entry">
          {formatMacroNumber(a.entryLow)} – {formatMacroNumber(a.entryHigh)}
        </Level>
        <Level label="Stop" tone="loss">
          {formatMacroNumber(a.stop)}
        </Level>
        <Level label="T1" tone="profit">
          {formatMacroNumber(a.t1)}
        </Level>
        <Level label="T2" tone="profit">
          {formatMacroNumber(a.t2)}
        </Level>
        <Level label="T3" tone="muted">
          {formatMacroNumber(a.t3)}
        </Level>
      </div>

      {(a.support.length > 0 || a.resistance.length > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-fg-3 mb-1.5">Support</div>
            <div className="flex flex-wrap gap-1">
              {a.support.slice(0, 3).map((s, i) => (
                <span key={i} className="tabular-nums text-xs px-1.5 py-0.5 rounded-md bg-profit/10 text-profit">
                  {formatMacroNumber(s.price)}
                </span>
              ))}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-fg-3 mb-1.5">Resistance</div>
            <div className="flex flex-wrap gap-1">
              {a.resistance.slice(0, 3).map((s, i) => (
                <span key={i} className="tabular-nums text-xs px-1.5 py-0.5 rounded-md bg-loss/10 text-loss">
                  {formatMacroNumber(s.price)}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="mt-3.5 text-sm text-fg-2 leading-snug">{shortRationale(a.rationale)}</p>

      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        className="mt-3 inline-flex items-center gap-1 text-xs text-fg-3 hover:text-fg transition-colors"
        data-testid="trader-detail-toggle"
      >
        {showDetail ? <CaretUp size={12} /> : <CaretDown size={12} />}
        {showDetail ? 'Less' : 'Details'}
      </button>

      {showDetail && (
        <div className="mt-3 pt-3 border-t border-border space-y-3 animate-[fade-up_0.25s_ease_both]" data-testid="trader-detail">
          <p className="text-xs text-fg-3 leading-relaxed">{a.invalidation}</p>
          <p className="text-sm text-fg-2 leading-relaxed whitespace-pre-line">{a.detail}</p>
          <div className="space-y-1">
            {a.perTimeframe.map((tf) => (
              <div key={tf.tf} className="flex items-center gap-2 text-xs text-fg-3">
                <span className="tabular-nums w-8 text-fg-2">{tf.tf}</span>
                <span className={tf.trend === 'up' ? 'text-profit' : tf.trend === 'down' ? 'text-loss' : ''}>
                  {tf.trend}
                </span>
                <span>RSI {tf.rsi.toFixed(0)}</span>
                <span>ATR {formatMacroNumber(tf.atr)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </article>
  );
}
