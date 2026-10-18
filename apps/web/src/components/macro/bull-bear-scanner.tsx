'use client';

import type { MacroState } from '@/lib/macro-api';
import { biasTone, formatBiasLabel } from '@/lib/macro-format';
import CountUp from './count-up';

function toneText(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'text-profit';
  if (tone === 'bear') return 'text-loss';
  return 'text-fg-3';
}
function chip(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'text-profit border-profit/30 bg-profit/10';
  if (tone === 'bear') return 'text-loss border-loss/30 bg-loss/10';
  return 'text-fg-3 border-border bg-surface-hover';
}
function lean(score: number): string {
  if (score >= 55) return 'LONG';
  if (score <= 45) return 'SHORT';
  return 'NEUTRAL';
}

/** Bipolar meter centered at 50 — fill extends right (bull) or left (bear). */
function Meter({ score, tone }: { score: number; tone: ReturnType<typeof biasTone> }) {
  const s = Math.max(0, Math.min(100, score));
  const left = Math.min(s, 50);
  const width = Math.abs(s - 50);
  const color = tone === 'bull' ? 'bg-profit' : tone === 'bear' ? 'bg-loss' : 'bg-fg-3';
  return (
    <div className="relative h-2 rounded-full bg-border-soft overflow-hidden">
      <span className="absolute left-1/2 top-0 h-full w-px bg-border-strong z-10" />
      <div
        className={`absolute top-0 h-full bar-grow-x ${color}`}
        style={{ left: `${left}%`, width: `${width}%`, transformOrigin: s >= 50 ? 'left center' : 'right center' }}
      />
    </div>
  );
}

export default function BullBearScanner({ bias }: { bias: MacroState['bias'] }) {
  if (!bias.length) {
    return (
      <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-scanner-empty">
        No bias scores yet — run an ingest after FRED is configured.
      </div>
    );
  }

  const ranked = [...bias].sort((a, b) => b.score - a.score);

  return (
    <section className="tcard p-3 sm:p-4" data-testid="macro-scanner">
      <div className="flex items-center justify-between border-b border-border-soft pb-2">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">Bull / bear scanner</div>
        <div className="flex items-center gap-3 text-[9px] tracking-[0.14em] text-fg-3">
          <span className="text-loss">BEARISH</span>
          <span>50</span>
          <span className="text-profit">BULLISH</span>
        </div>
      </div>

      <div className="mt-2 space-y-2">
        {ranked.map((b, i) => {
          const tone = biasTone(b.label);
          return (
            <div
              key={b.asset}
              className="rounded-[var(--radius-card)] border border-border-soft bg-surface/30 p-3 rise"
              style={{ ['--i' as string]: i }}
              data-testid={`macro-scanner-${b.asset}`}
            >
              <div className="flex items-center gap-3">
                <span className="numeric text-[10px] text-fg-3 w-4 text-center">{i + 1}</span>
                <span className="font-display font-black text-base tracking-tight w-16">{b.asset}</span>
                <span className={`text-[9px] px-1.5 py-0.5 rounded border ${chip(tone)}`}>
                  {formatBiasLabel(b.label)}
                </span>
                <div className="flex-1" />
                <span className={`text-[9px] tracking-[0.14em] ${toneText(tone)}`}>{lean(b.score)}</span>
                <CountUp
                  value={b.score}
                  className={`numeric text-xl font-display font-black w-8 text-right ${toneText(tone)}`}
                />
              </div>

              <div className="mt-2">
                <Meter score={b.score} tone={tone} />
              </div>

              <div className="mt-2.5 grid sm:grid-cols-2 gap-2">
                <div className="flex flex-wrap gap-1 content-start">
                  {b.supporting.length === 0 ? (
                    <span className="text-[10px] text-fg-3">No supporting factors</span>
                  ) : (
                    b.supporting.map(s => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 rounded border border-profit/25 bg-profit/10 text-profit">
                        + {s}
                      </span>
                    ))
                  )}
                </div>
                <div className="flex flex-wrap gap-1 content-start sm:justify-end">
                  {b.opposing.length === 0 ? (
                    <span className="text-[10px] text-fg-3">No opposing factors</span>
                  ) : (
                    b.opposing.map(s => (
                      <span key={s} className="text-[10px] px-1.5 py-0.5 rounded border border-loss/25 bg-loss/10 text-loss">
                        − {s}
                      </span>
                    ))
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
