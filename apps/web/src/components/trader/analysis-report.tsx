'use client';

import { useState } from 'react';
import { formatMacroNumber, formatAsOf } from '@/lib/macro-format';
import type { TraderAnalysis } from '@/lib/trader-api';

function dirClass(d: string): string {
  if (d === 'LONG') return 'text-profit border-profit/30 bg-profit/10';
  if (d === 'SHORT') return 'text-loss border-loss/30 bg-loss/10';
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

  return (
    <article className="tcard p-4 sm:p-5 flex flex-col" data-testid="trader-report">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 shrink-0">
        <div className="min-w-0">
          <span className="font-display font-black text-2xl tracking-tight">{a.symbol}</span>
          <span className="ml-2 text-[10px] tracking-[0.14em] uppercase text-fg-3">{a.assetClass}</span>
        </div>
        <span className={`text-[11px] tracking-[0.16em] px-3 py-1 rounded border ${dirClass(a.direction)}`} data-testid="trader-direction">
          {a.direction}
        </span>
      </div>

      <div className="mt-1 flex items-center gap-2 text-[10px] tracking-[0.12em] text-fg-3">
        <span>{a.timeframes.join(' · ')}</span>
        <span>•</span>
        <span>{formatAsOf(a.asOf)}</span>
        <span className={`ml-auto ${a.aiUsed ? 'text-fg-2' : 'text-fg-3'}`}>{a.aiUsed ? 'AI + engine' : 'engine'}</span>
      </div>

      {/* Confidence */}
      <div className="mt-3 shrink-0">
        <div className="flex items-center justify-between text-[9px] tracking-[0.14em] text-fg-3">
          <span>CONFIDENCE</span>
          <span className="numeric text-fg">{a.confidence}%</span>
        </div>
        <div className="mt-1 h-1 rounded-full bg-border-soft overflow-hidden">
          <div className="h-full bg-fg-2" style={{ width: `${conf}%` }} />
        </div>
      </div>

      {/* Levels */}
      <div className="mt-3">
        <Row label="Entry">
          {formatMacroNumber(a.entryLow)} – {formatMacroNumber(a.entryHigh)}
        </Row>
        <Row label="Stop Loss"><span className="text-loss">{formatMacroNumber(a.stop)}</span></Row>
        <Row label="Target 1"><span className="text-profit">{formatMacroNumber(a.t1)}</span></Row>
        <Row label="Target 2"><span className="text-profit">{formatMacroNumber(a.t2)}</span></Row>
        <Row label="Target 3"><span className="text-fg-2">{formatMacroNumber(a.t3)}</span></Row>
      </div>

      {/* Support / Resistance */}
      {(a.support.length > 0 || a.resistance.length > 0) && (
        <div className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[9px] tracking-[0.14em] text-fg-3 mb-1">SUPPORT</div>
            <div className="flex flex-wrap gap-1">
              {a.support.length ? a.support.map((s, i) => (
                <span key={i} className="numeric text-[11px] px-1.5 py-0.5 rounded bg-profit/10 text-profit border border-profit/20">
                  {formatMacroNumber(s.price)}
                </span>
              )) : <span className="text-[11px] text-fg-3">—</span>}
            </div>
          </div>
          <div>
            <div className="text-[9px] tracking-[0.14em] text-fg-3 mb-1">RESISTANCE</div>
            <div className="flex flex-wrap gap-1">
              {a.resistance.length ? a.resistance.map((s, i) => (
                <span key={i} className="numeric text-[11px] px-1.5 py-0.5 rounded bg-loss/10 text-loss border border-loss/20">
                  {formatMacroNumber(s.price)}
                </span>
              )) : <span className="text-[11px] text-fg-3">—</span>}
            </div>
          </div>
        </div>
      )}

      {/* Rationale */}
      <p className="text-[12px] text-fg-2 mt-3 leading-relaxed">{a.rationale}</p>
      <p className="text-[11px] text-fg-3 mt-2">
        <span className="text-fg-2">Invalidation:</span> {a.invalidation}
      </p>

      {/* View Detailed Analysis */}
      <button
        type="button"
        onClick={() => setShowDetail(v => !v)}
        className="mt-3 self-start text-[11px] tracking-[0.12em] uppercase text-fg-2 hover:text-fg underline-offset-2 hover:underline"
        data-testid="trader-detail-toggle"
      >
        {showDetail ? '▲ Hide detailed analysis' : '▼ View detailed analysis'}
      </button>

      {showDetail && (
        <div className="mt-3 pt-3 border-t border-border-soft space-y-3" data-testid="trader-detail">
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

      <div className="mt-3 pt-3 border-t border-border-soft flex items-center justify-between shrink-0">
        <span className="text-[9px] tracking-[0.14em] text-fg-3">{a.engineVer}</span>
        <span className="text-[9px] tracking-[0.14em] text-fg-3">Not financial advice</span>
      </div>
    </article>
  );
}
