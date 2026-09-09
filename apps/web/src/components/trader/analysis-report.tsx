'use client';

import { useState } from 'react';
import { formatMacroNumber, formatAsOf } from '@/lib/macro-format';
import type { TraderAnalysis } from '@/lib/trader-api';
import { OutcomeBadge } from './outcome-badge';

function dirClass(d: string): string {
  if (d === 'LONG') return 'text-profit border-profit/30 bg-profit/10 shadow-[0_0_24px_-8px] shadow-profit/40';
  if (d === 'SHORT') return 'text-loss border-loss/30 bg-loss/10 shadow-[0_0_24px_-8px] shadow-loss/40';
  return 'text-fg-3 border-border bg-surface-hover';
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between py-1.5 border-b border-border-soft last:border-b-0">
      <span className="text-[10px] tracking-[0.14em] text-fg-3 uppercase">{label}</span>
      <span className="numeric text-[12px] text-fg">{children}</span>
    </div>
  );
}

function trendChip(t: string): string {
  if (t === 'up') return 'text-profit';
  if (t === 'down') return 'text-loss';
  return 'text-fg-3';
}

export default function AnalysisReport({ a }: { a: TraderAnalysis }) {
  const [showDetail, setShowDetail] = useState(false);
  const conf = Math.max(0, Math.min(100, a.confidence));
  const confTone = a.direction === 'LONG' ? 'bg-profit' : a.direction === 'SHORT' ? 'bg-loss' : 'bg-fg-2';

  return (
    <article
      className="tcard p-4 sm:p-5 flex flex-col relative overflow-hidden animate-[fade-up_0.45s_ease_both]"
      data-testid="trader-report"
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-50"
        style={{
          background:
            a.direction === 'LONG'
              ? 'linear-gradient(180deg, color-mix(in oklab, var(--color-profit) 14%, transparent), transparent)'
              : a.direction === 'SHORT'
                ? 'linear-gradient(180deg, color-mix(in oklab, var(--color-loss) 14%, transparent), transparent)'
                : 'linear-gradient(180deg, color-mix(in oklab, var(--color-fg-3) 10%, transparent), transparent)',
        }}
      />

      <div className="relative flex items-start justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <span className="font-display font-black text-2xl tracking-tight">{a.symbol}</span>
          <span className="ml-2 text-[10px] tracking-[0.14em] uppercase text-fg-3">{a.assetClass}</span>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          <span
            className={`text-[11px] tracking-[0.16em] px-3 py-1 rounded border ${dirClass(a.direction)}`}
            data-testid="trader-direction"
          >
            {a.direction}
          </span>
          <OutcomeBadge outcome={a.outcome} hitLevel={a.hitLevel} pending={!a.outcome && !!a.id} />
        </div>
      </div>

      <div className="relative mt-1 flex items-center gap-2 text-[10px] tracking-[0.12em] text-fg-3">
        <span>{a.timeframes.join(' · ')}</span>
        <span>•</span>
        <span>{formatAsOf(a.asOf)}</span>
        <span className={`ml-auto ${a.aiUsed ? 'text-fg-2' : 'text-fg-3'}`}>
          {a.aiUsed ? 'AI + engine' : 'engine'}
        </span>
      </div>

      <div className="relative mt-3 shrink-0">
        <div className="flex items-center justify-between text-[9px] tracking-[0.14em] text-fg-3">
          <span>CONFIDENCE</span>
          <span className="numeric text-fg">{a.confidence}%</span>
        </div>
        <div className="mt-1.5 h-1.5 rounded-full bg-border-soft overflow-hidden">
          <div
            className={`h-full ${confTone} origin-left animate-[bar-grow-x_0.7s_ease_both]`}
            style={{ width: `${conf}%` }}
          />
        </div>
      </div>

      {a.laneBreakdown && a.laneBreakdown.length > 0 && (
        <div className="relative mt-3" data-testid="trader-lanes">
          <div className="text-[9px] tracking-[0.14em] text-fg-3 mb-1.5">LANES</div>
          <ul className="space-y-1.5">
            {a.laneBreakdown.map((lane, i) => {
              const bull = lane.score > 0.08;
              const bear = lane.score < -0.08;
              const pct = Math.round(Math.abs(lane.score) * 100);
              return (
                <li
                  key={lane.id}
                  className="rounded-lg border border-border-soft bg-app/30 px-2.5 py-1.5 animate-[fade-up_0.35s_ease_both]"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] tracking-[0.14em] uppercase text-fg-2 w-16 shrink-0">
                      {lane.id}
                    </span>
                    <div className="flex-1 h-1 rounded-full bg-border-soft overflow-hidden">
                      <div
                        className={`h-full origin-left ${bull ? 'bg-profit' : bear ? 'bg-loss' : 'bg-fg-3'}`}
                        style={{ width: `${Math.max(6, pct)}%` }}
                      />
                    </div>
                    <span
                      className={`numeric text-[10px] w-10 text-right ${
                        bull ? 'text-profit' : bear ? 'text-loss' : 'text-fg-3'
                      }`}
                    >
                      {lane.score > 0 ? '+' : ''}
                      {lane.score.toFixed(2)}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-fg-3 truncate pl-[4.5rem]">{lane.rationale}</p>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className="relative mt-3 rounded-lg border border-border-soft bg-app/30 px-3 py-1">
        <Row label="Entry">
          {formatMacroNumber(a.entryLow)} – {formatMacroNumber(a.entryHigh)}
        </Row>
        <Row label="Stop Loss">
          <span className="text-loss">{formatMacroNumber(a.stop)}</span>
        </Row>
        <Row label="Target 1">
          <span className="text-profit">{formatMacroNumber(a.t1)}</span>
        </Row>
        <Row label="Target 2">
          <span className="text-profit">{formatMacroNumber(a.t2)}</span>
        </Row>
        <Row label="Target 3">
          <span className="text-fg-2">{formatMacroNumber(a.t3)}</span>
        </Row>
      </div>

      {(a.support.length > 0 || a.resistance.length > 0) && (
        <div className="relative mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[9px] tracking-[0.14em] text-fg-3 mb-1">SUPPORT</div>
            <div className="flex flex-wrap gap-1">
              {a.support.length ? (
                a.support.map((s, i) => (
                  <span
                    key={i}
                    className="numeric text-[11px] px-1.5 py-0.5 rounded bg-profit/10 text-profit border border-profit/20"
                  >
                    {formatMacroNumber(s.price)}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-fg-3">—</span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.14em] text-fg-3 mb-1">RESISTANCE</div>
            <div className="flex flex-wrap gap-1">
              {a.resistance.length ? (
                a.resistance.map((s, i) => (
                  <span
                    key={i}
                    className="numeric text-[11px] px-1.5 py-0.5 rounded bg-loss/10 text-loss border border-loss/20"
                  >
                    {formatMacroNumber(s.price)}
                  </span>
                ))
              ) : (
                <span className="text-[11px] text-fg-3">—</span>
              )}
            </div>
          </div>
        </div>
      )}

      {(a.mfePct != null || a.maePct != null) && a.outcome && (
        <div className="relative mt-3 flex gap-3 text-[10px] text-fg-3 numeric">
          {a.mfePct != null && (
            <span>
              MFE <span className="text-profit">{a.mfePct.toFixed(2)}%</span>
            </span>
          )}
          {a.maePct != null && (
            <span>
              MAE <span className="text-loss">{a.maePct.toFixed(2)}%</span>
            </span>
          )}
        </div>
      )}

      <p className="relative text-[12px] text-fg-2 mt-3 leading-relaxed">{a.rationale}</p>
      <p className="relative text-[11px] text-fg-3 mt-2">
        <span className="text-fg-2">Invalidation:</span> {a.invalidation}
      </p>

      <button
        type="button"
        onClick={() => setShowDetail((v) => !v)}
        className="relative mt-3 self-start text-[11px] tracking-[0.12em] uppercase text-fg-2 hover:text-fg transition-colors"
        data-testid="trader-detail-toggle"
      >
        {showDetail ? 'Hide detailed analysis' : 'View detailed analysis'}
      </button>

      {showDetail && (
        <div
          className="relative mt-3 pt-3 border-t border-border-soft space-y-3 animate-[fade-up_0.35s_ease_both]"
          data-testid="trader-detail"
        >
          <p className="text-[12px] text-fg-2 leading-relaxed whitespace-pre-line">{a.detail}</p>
          <div className="space-y-1.5">
            {a.perTimeframe.map((tf) => (
              <div key={tf.tf} className="flex items-center gap-2 text-[11px]">
                <span className="numeric w-10 text-fg-3">{tf.tf}</span>
                <span className={`uppercase tracking-wide ${trendChip(tf.trend)}`}>{tf.trend}</span>
                <span className="text-fg-3">RSI {tf.rsi.toFixed(0)}</span>
                <span className="text-fg-3">ATR {formatMacroNumber(tf.atr)}</span>
                <span className="text-fg-3 truncate">{tf.note}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="relative mt-3 pt-3 border-t border-border-soft flex items-center justify-between shrink-0">
        <span className="text-[9px] tracking-[0.14em] text-fg-3">{a.engineVer}</span>
        <span className="text-[9px] tracking-[0.14em] text-fg-3">Not financial advice</span>
      </div>
    </article>
  );
}
