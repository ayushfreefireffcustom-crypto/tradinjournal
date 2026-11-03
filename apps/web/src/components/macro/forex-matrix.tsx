'use client';

import EmptyState from '@/components/v6/ui/empty-state';
import type { MacroState } from '@/lib/macro-api';
import { PanelHead } from '@/components/v6/macro/ui';
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

const heat = (s: number) => (s >= 60 ? 'pos' : s <= 40 ? 'neg' : '');

/** Currency strength ranking and pairwise matrix from the free ER-API USD basket. */
export default function ForexMatrix({ fx }: { fx: MacroState['fx'] }) {
  const scores = strengthScores(fx ?? []);

  return (
    <div className="mc-stack" data-testid="macro-forex-matrix">
      <PanelHead eyebrow="Forex strength" title="Currency strength"
        lead="Relative strength against the USD cross-section from free official FX references (ER-API). Not a tick feed; an educational relative ranking only." />

      {!scores.length ? (
        <div className="x-card"><EmptyState icon="globe" ghost="bars" title="No FX basket yet">Currency strength scores fill in on the next macro update.</EmptyState></div>
      ) : (
        <>
          <div className="mc-fx">
            {scores.map((r, i) => (
              <article key={r.code} className="x-card mc-fx-t" data-testid={`macro-fx-${r.code}`}>
                <div className="mc-fx-h"><b>{r.code}</b><span className="m x-dim">#{i + 1}</span></div>
                <b className={`mc-fx-n ${heat(r.score)}`}><CountUp value={r.score} duration={900} /></b>
                <div className="x-bar"><i style={{ width: `${r.score}%`, background: r.score >= 60 ? 'var(--g)' : r.score <= 40 ? 'var(--r)' : 'var(--mut)' }} /></div>
                <small className="m">{r.rate.toFixed(r.rate >= 20 ? 2 : 4)} / USD</small>
              </article>
            ))}
          </div>

          <section className="x-card">
            <div className="x-ch"><h2>Pair matrix</h2><span className="x-sub">row score minus column score</span></div>
            <div className="x-tblwrap mc-fxm-wrap">
              <table className="x-tbl mc-fxm">
                <thead><tr><th>Pair</th>{scores.map(c => <th key={c.code} className="n">{c.code}</th>)}</tr></thead>
                <tbody>
                  {scores.map(row => (
                    <tr key={row.code}>
                      <td><b>{row.code}</b></td>
                      {scores.map(col => {
                        if (row.code === col.code) return <td key={col.code} className="n x-dim">—</td>;
                        const diff = row.score - col.score;
                        return <td key={col.code} className={`n m ${diff > 8 ? 'pos' : diff < -8 ? 'neg' : 'x-muted'}`}>{diff > 0 ? '+' : diff < 0 ? '−' : ''}{Math.abs(diff)}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
