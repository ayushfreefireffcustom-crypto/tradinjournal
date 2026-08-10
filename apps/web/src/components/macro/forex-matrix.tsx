'use client';

import type { MacroState } from '@/lib/macro-api';
import CountUp from './count-up';

const MAJORS = ['EUR', 'JPY', 'GBP', 'CAD', 'CHF', 'AUD', 'NZD', 'CNY', 'INR', 'SEK'] as const;

/**
 * Strength score from USD-base rates: lower foreign units per USD = stronger FX.
 * We invert vs the cross-section mean so strong currencies score high.
 */
function strengthScores(fx: NonNullable<MacroState['fx']>): { code: string; score: number; rate: number }[] {
  const rows = MAJORS
    .map(code => fx.find(r => r.code === code))
    .filter((r): r is NonNullable<typeof r> => !!r);
  if (!rows.length) return [];

  // For JPY/INR etc rates are large; normalize via log so scales compare.
  const logs = rows.map(r => ({ code: r.code, rate: r.rate, log: Math.log(r.rate) }));
  const mean = logs.reduce((s, r) => s + r.log, 0) / logs.length;
  const maxDev = Math.max(...logs.map(r => Math.abs(r.log - mean)), 0.01);

  return logs
    .map(r => {
      // Below-mean log rate → stronger currency vs USD basket
      const z = (mean - r.log) / maxDev;
      const score = Math.round(50 + z * 40);
      return { code: r.code, rate: r.rate, score: Math.max(5, Math.min(95, score)) };
    })
    .sort((a, b) => b.score - a.score);
}

function heat(score: number): string {
  if (score >= 60) return 'bg-profit/20 border-profit/30 text-profit';
  if (score <= 40) return 'bg-loss/20 border-loss/30 text-loss';
  return 'bg-surface-hover border-border-soft text-fg-2';
}

/** 10-currency strength matrix from free ER-API USD basket. */
export default function ForexMatrix({ fx }: { fx: MacroState['fx'] }) {
  const scores = strengthScores(fx ?? []);

  return (
    <div className="space-y-3" data-testid="macro-forex-matrix">
      <div>
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// FOREX STRENGTH MATRIX</div>
        <h2 className="font-display font-black text-xl tracking-tight mt-1">Currency Strength</h2>
        <p className="text-[12px] text-fg-3 mt-1 max-w-2xl leading-relaxed">
          Relative strength vs the USD cross-section from free official FX refs (ER-API). Not a tick feed —
          educational relative ranking only.
        </p>
      </div>

      {!scores.length ? (
        <div className="tcard p-4 text-sm text-fg-3">No FX basket yet — will populate on next state build.</div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-stretch">
            {scores.map((r, i) => (
              <div
                key={r.code}
                className={`tcard p-3 border flex flex-col h-full rise ${heat(r.score)}`}
                style={{ ['--i' as string]: i }}
                data-testid={`macro-fx-${r.code}`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-display font-black text-lg tracking-tight">{r.code}</span>
                  <span className="text-[10px] text-fg-3 numeric">#{i + 1}</span>
                </div>
                <div className="numeric text-2xl font-black mt-2">
                  <CountUp value={r.score} duration={900} />
                </div>
                <div className="text-[10px] text-fg-3 mt-auto pt-2 numeric">
                  {r.rate.toFixed(r.rate >= 20 ? 2 : 4)} / USD
                </div>
              </div>
            ))}
          </div>

          <div className="tcard p-0 overflow-x-auto">
            <table className="w-full min-w-[520px] text-[11px]">
              <thead>
                <tr className="border-b border-border-soft">
                  <th className="px-3 py-2 text-left text-[10px] tracking-[0.14em] text-fg-3">PAIR</th>
                  {scores.map(c => (
                    <th key={c.code} className="px-2 py-2 text-center text-[10px] tracking-[0.1em] text-fg-3">{c.code}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {scores.map(row => (
                  <tr key={row.code} className="border-b border-border-soft last:border-0">
                    <td className="px-3 py-2 font-medium text-fg">{row.code}</td>
                    {scores.map(col => {
                      if (row.code === col.code) {
                        return <td key={col.code} className="px-2 py-2 text-center text-fg-3">—</td>;
                      }
                      const diff = row.score - col.score;
                      const cls = diff > 8 ? 'text-profit' : diff < -8 ? 'text-loss' : 'text-fg-3';
                      return (
                        <td key={col.code} className={`px-2 py-2 text-center numeric ${cls}`}>
                          {diff > 0 ? '+' : ''}{diff}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
