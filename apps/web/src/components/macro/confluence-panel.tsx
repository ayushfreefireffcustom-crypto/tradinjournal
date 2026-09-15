'use client';

import { useCountUp } from '@/hooks/use-count-up';
import { biasTone, averageBiasScore } from '@/lib/macro-format';
import type { MacroState } from '@/lib/macro-api';
import CountUp from './count-up';

function toneText(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'text-profit';
  if (tone === 'bear') return 'text-loss';
  return 'text-fg-3';
}
function toneBar(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'bg-profit';
  if (tone === 'bear') return 'bg-loss';
  return 'bg-fg-3';
}
function lean(score: number): string {
  if (score >= 55) return 'LONG';
  if (score <= 45) return 'SHORT';
  return 'NEUTRAL';
}

/** Confluence engine — master score gauge + per-asset lean bars. */
export default function ConfluencePanel({ bias }: { bias: MacroState['bias'] }) {
  const avg = averageBiasScore(bias);
  const target = avg ?? 50;
  const score = useCountUp(avg == null ? null : target, { duration: 1000 }) ?? (avg == null ? 0 : target);
  const live = avg == null ? 50 : score;
  const angle = ((live / 100) * 180) - 90;
  const rad = (angle * Math.PI) / 180;
  const cx = 60, cy = 58, r = 42;
  const nx = cx + r * Math.sin(rad);
  const ny = cy - r * Math.cos(rad);
  const gTone = avg == null ? 'neutral' : live >= 55 ? 'bull' : live <= 45 ? 'bear' : 'neutral';
  const arcLen = Math.PI * r;

  return (
    <div className="tcard p-4 flex flex-col h-full min-h-[260px] rise" style={{ ['--i' as string]: 1 }} data-testid="macro-confluence">
      <div className="flex items-center justify-between shrink-0">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// CONFLUENCE ENGINE</div>
        <div className="text-[10px] tracking-[0.14em] text-fg-3">{bias.length} ASSETS</div>
      </div>

      <div className="flex-1 flex items-center gap-4 mt-2 min-h-0">
        <div className="flex flex-col items-center shrink-0">
          <svg viewBox="0 0 120 70" className="w-[132px] h-auto aspect-[120/70]" aria-hidden>
            <path d="M 18 58 A 42 42 0 0 1 102 58" fill="none" stroke="var(--color-border-strong)" strokeWidth="8" strokeLinecap="round" />
            <path
              d="M 18 58 A 42 42 0 0 1 102 58"
              fill="none"
              stroke={gTone === 'bull' ? 'var(--color-profit)' : gTone === 'bear' ? 'var(--color-loss)' : 'var(--color-fg-3)'}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={`${(live / 100) * arcLen} ${arcLen}`}
            />
            <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--color-fg)" strokeWidth="2" strokeLinecap="round" />
            <circle cx={cx} cy={cy} r="3" fill="var(--color-fg)" />
          </svg>
          <div className={`numeric text-2xl font-display font-black -mt-1 ${toneText(gTone)}`} data-testid="confluence-avg">
            {avg == null ? '—' : <CountUp value={target} duration={1000} />}
          </div>
          <div className="text-[9px] tracking-[0.2em] text-fg-3">NET BIAS</div>
        </div>

        <div className="flex-1 min-w-0 space-y-2.5">
          {bias.length === 0 ? (
            <p className="text-[12px] text-fg-3">No confluence scores yet.</p>
          ) : (
            bias.map((b, i) => {
              const tone = biasTone(b.label);
              return (
                <div key={b.asset} data-testid={`confluence-asset-${b.asset}`} className="rise" style={{ ['--i' as string]: i }}>
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="tracking-[0.14em] text-fg-2">{b.asset}</span>
                    <span className="flex items-center gap-1.5">
                      <span className={`text-[9px] tracking-[0.12em] ${toneText(tone)}`}>{lean(b.score)}</span>
                      <CountUp value={b.score} className="numeric text-fg tabular-nums w-6 text-right" />
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-border-soft overflow-hidden relative">
                    <span className="absolute left-1/2 top-0 h-full w-px bg-border-strong/70 z-10" />
                    {(() => {
                      const s = Math.max(0, Math.min(100, b.score));
                      const left = Math.min(s, 50);
                      const width = Math.abs(s - 50);
                      return (
                        <div
                          className={`absolute top-0 h-full bar-grow-x ${toneBar(tone)}`}
                          style={{
                            left: `${left}%`,
                            width: `${width}%`,
                            transformOrigin: s >= 50 ? 'left center' : 'right center',
                            ['--i' as string]: i,
                          }}
                        />
                      );
                    })()}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="mt-auto pt-3 flex items-center justify-between text-[9px] tracking-[0.14em] text-fg-3 border-t border-border-soft shrink-0">
        <span className="text-profit">▲ LONG ≥ 55</span>
        <span>NEUTRAL 45–55</span>
        <span className="text-loss">SHORT ≤ 45 ▼</span>
      </div>
    </div>
  );
}
