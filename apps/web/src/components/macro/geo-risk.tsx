'use client';

import type { MacroState } from '@/lib/macro-api';
import { formatWhen } from '@/lib/macro-format';

const GEO_KEYS = [
  'war', 'conflict', 'sanction', 'missile', 'invasion', 'tariff', 'election',
  'geopolit', 'nato', 'iran', 'ukraine', 'taiwan', 'china', 'opec', 'embargo',
  'strike', 'coup', 'protest', 'terrorism', 'hostage',
];

function scoreHeadline(title: string): number {
  const t = title.toLowerCase();
  let score = 0;
  for (const k of GEO_KEYS) {
    if (t.includes(k)) score += k.length > 6 ? 18 : 12;
  }
  return Math.min(100, score);
}

function tier(score: number): { label: string; cls: string } {
  if (score >= 40) return { label: 'STRUCTURAL', cls: 'text-loss border-loss/30 bg-loss/10' };
  if (score >= 18) return { label: 'WATCH', cls: 'text-warning border-warning/30 bg-warning/10' };
  return { label: 'NOISE', cls: 'text-fg-3 border-border-soft' };
}

/** Lightweight geopolitics board — keyword heuristic over free news (not a paid geo terminal). */
export default function GeoRisk({ headlines }: { headlines: MacroState['headlines'] }) {
  const now = Date.now();
  const scored = headlines
    .map(h => ({ ...h, score: scoreHeadline(h.title) }))
    .filter(h => h.score > 0)
    .sort((a, b) => b.score - a.score);

  const avg = scored.length
    ? Math.round(scored.reduce((s, h) => s + h.score, 0) / scored.length)
    : 0;
  const heat = avg >= 35 ? 'ELEVATED' : avg >= 15 ? 'MODERATE' : 'LOW';
  const heatCls =
    avg >= 35 ? 'text-loss border-loss/30 bg-loss/10'
    : avg >= 15 ? 'text-warning border-warning/30 bg-warning/10'
    : 'text-profit border-profit/30 bg-profit/10';

  return (
    <div className="space-y-3" data-testid="macro-geo-risk">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-fg-3">// GEOPOLITICAL RISK</div>
          <h2 className="font-display font-black text-xl tracking-tight mt-1">Event Heat</h2>
        </div>
        <span className={`text-[10px] tracking-[0.14em] px-2.5 py-1 rounded border ${heatCls}`}>
          HEAT · {heat} · {avg}
        </span>
      </div>

      <p className="text-[12px] text-fg-3 max-w-2xl leading-relaxed">
        Heuristic keyword scoring over the free news wire — educational triage, not a proprietary
        geopolitics terminal. Structural vs emotional labels are model output only.
      </p>

      {!scored.length ? (
        <div className="tcard p-4 text-sm text-fg-3">No geopolitics-tagged headlines in the current window.</div>
      ) : (
        <ul className="tcard divide-y divide-border-soft" data-testid="macro-geo-list">
          {scored.slice(0, 12).map((h, i) => {
            const t = tier(h.score);
            return (
              <li key={`${h.url}-${i}`} className="p-3 flex items-start gap-3">
                <span className={`text-[9px] tracking-[0.12em] px-1.5 py-0.5 rounded border shrink-0 ${t.cls}`}>
                  {t.label}
                </span>
                <div className="min-w-0 flex-1">
                  <a href={h.url} target="_blank" rel="noreferrer" className="text-[13px] text-fg hover:text-profit transition-colors line-clamp-2">
                    {h.title}
                  </a>
                  <div className="text-[10px] text-fg-3 mt-1">
                    {h.source ?? '—'} · {formatWhen(h.at, now)} · score {h.score}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
