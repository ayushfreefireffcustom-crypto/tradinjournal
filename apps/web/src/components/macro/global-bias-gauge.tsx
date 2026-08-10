'use client';

import { useCountUp } from '@/hooks/use-count-up';
import { biasTone, averageBiasScore } from '@/lib/macro-format';
import type { MacroState } from '@/lib/macro-api';
import CountUp from './count-up';

function toneStroke(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'var(--color-profit)';
  if (tone === 'bear') return 'var(--color-loss)';
  return 'var(--color-fg-3)';
}

function toneText(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'text-profit';
  if (tone === 'bear') return 'text-loss';
  return 'text-fg-3';
}

function leanLabel(score: number): string {
  if (score >= 70) return 'Strong Bullish';
  if (score >= 60) return 'Bullish';
  if (score >= 55) return 'Mild Bullish';
  if (score > 45) return 'Neutral';
  if (score > 40) return 'Mild Bearish';
  if (score > 30) return 'Bearish';
  return 'Strong Bearish';
}

/** Large semi-circle confluence gauge for the command-centre hero. */
export default function GlobalBiasGauge({ bias }: { bias: MacroState['bias'] }) {
  const avg = averageBiasScore(bias);
  const target = avg ?? 50;
  const score = useCountUp(avg == null ? null : target, { duration: 1100 }) ?? (avg == null ? 0 : target);
  const live = avg == null ? 50 : score;
  const angle = ((live / 100) * 180) - 90;
  const rad = (angle * Math.PI) / 180;
  const cx = 100, cy = 96, r = 72;
  const nx = cx + r * Math.sin(rad);
  const ny = cy - r * Math.cos(rad);
  const tone = avg == null ? 'neutral' : live >= 55 ? 'bull' : live <= 45 ? 'bear' : 'neutral';
  const arcLen = Math.PI * r;
  const dash = (live / 100) * arcLen;

  return (
    <div className="tcard p-3 sm:p-5 flex flex-col h-full min-h-[220px] sm:min-h-[280px] rise" style={{ ['--i' as string]: 0 }} data-testid="macro-global-bias">
      <div className="flex items-center justify-between shrink-0 gap-2">
        <div className="text-[10px] tracking-[0.2em] text-fg-3 truncate">// GLOBAL MACRO MARKET BIAS</div>
        <div className="text-[10px] tracking-[0.14em] text-fg-3 shrink-0">{bias.length} ASSETS</div>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center py-2">
        <svg viewBox="0 0 200 120" className="w-full max-w-[280px]" aria-hidden>
          <path
            d="M 28 96 A 72 72 0 0 1 172 96"
            fill="none"
            stroke="var(--color-border-strong)"
            strokeWidth="12"
            strokeLinecap="round"
          />
          <path
            d="M 28 96 A 72 72 0 0 1 172 96"
            fill="none"
            stroke={toneStroke(tone)}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${arcLen}`}
            className="gauge-arc-anim"
            style={{ transition: 'stroke-dasharray 80ms linear' }}
          />
          <line
            x1={cx}
            y1={cy}
            x2={nx}
            y2={ny}
            stroke="var(--color-fg)"
            strokeWidth="2.5"
            strokeLinecap="round"
            style={{ transition: 'x2 80ms linear, y2 80ms linear' }}
          />
          <circle cx={cx} cy={cy} r="4" fill="var(--color-fg)" />
          <text x="28" y="114" fontSize="9" fill="var(--color-loss)" letterSpacing="1">BEAR</text>
          <text x="155" y="114" fontSize="9" fill="var(--color-profit)" letterSpacing="1">BULL</text>
        </svg>

        <div className={`numeric text-3xl font-display font-black -mt-1 ${toneText(tone)}`} data-testid="global-bias-score">
          {avg == null ? '—' : <CountUp value={target} suffix="%" duration={1100} />}
        </div>
        <div className={`text-[13px] font-medium mt-0.5 ${toneText(tone)}`}>
          {avg == null ? 'Awaiting factors' : leanLabel(Math.round(live))}
        </div>
        <p className="text-[11px] text-fg-3 text-center mt-2 max-w-xs leading-relaxed">
          Weighted across {bias.length || '—'} macro factors · 7-tier scale
        </p>
      </div>
    </div>
  );
}
