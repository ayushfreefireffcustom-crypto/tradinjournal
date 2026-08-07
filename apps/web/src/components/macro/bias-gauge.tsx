'use client';

import { biasTone, formatScore, averageBiasScore } from '@/lib/macro-format';
import type { MacroState } from '@/lib/macro-api';

function toneClass(tone: ReturnType<typeof biasTone>): string {
  if (tone === 'bull') return 'text-profit';
  if (tone === 'bear') return 'text-loss';
  return 'text-fg-3';
}

/** SVG semicircle gauge — no Chart.js dependency. */
export default function BiasGauge({
  bias,
  regime,
}: {
  bias: MacroState['bias'];
  regime: MacroState['regime'];
}) {
  const avg = averageBiasScore(bias);
  const score = avg ?? 50;
  // Map 0–100 → angle on a semicircle (−90° … +90°), 50 at top.
  const angle = ((score / 100) * 180) - 90;
  const rad = (angle * Math.PI) / 180;
  const cx = 60;
  const cy = 58;
  const r = 42;
  const nx = cx + r * Math.sin(rad);
  const ny = cy - r * Math.cos(rad);
  const tone = avg == null ? 'neutral' : score >= 55 ? 'bull' : score <= 45 ? 'bear' : 'neutral';

  return (
    <div className="tcard p-4 flex flex-col items-center" data-testid="macro-bias-gauge">
      <div className="text-[10px] tracking-[0.2em] text-fg-3 self-start">// CONFLUENCE</div>
      <svg viewBox="0 0 120 70" className="w-full max-w-[200px] mt-2" aria-hidden>
        <path
          d="M 18 58 A 42 42 0 0 1 102 58"
          fill="none"
          stroke="var(--color-border-strong)"
          strokeWidth="8"
          strokeLinecap="round"
        />
        <path
          d="M 18 58 A 42 42 0 0 1 102 58"
          fill="none"
          stroke={tone === 'bull' ? 'var(--color-profit)' : tone === 'bear' ? 'var(--color-loss)' : 'var(--color-fg-3)'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * 132} 132`}
        />
        <line x1={cx} y1={cy} x2={nx} y2={ny} stroke="var(--color-fg)" strokeWidth="2" strokeLinecap="round" />
        <circle cx={cx} cy={cy} r="3" fill="var(--color-fg)" />
      </svg>
      <div className={`numeric text-3xl font-display font-black mt-1 ${toneClass(tone)}`} data-testid="macro-gauge-score">
        {avg == null ? '—' : formatScore(score)}
      </div>
      <div className="text-[11px] text-fg-3 mt-1">
        {regime ? (
          <>
            <span className="text-fg" data-testid="macro-regime-label">{regime.label}</span>
            {regime.recessionOdds != null && (
              <span className="ml-2">· recession {Math.round(regime.recessionOdds)}%</span>
            )}
          </>
        ) : (
          <span>No regime yet</span>
        )}
      </div>
    </div>
  );
}
