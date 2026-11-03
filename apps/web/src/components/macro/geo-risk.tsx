'use client';

import EmptyState from '@/components/v6/ui/empty-state';
import type { MacroState } from '@/lib/macro-api';
import { formatWhen } from '@/lib/macro-format';
import { IExt, PanelHead } from '@/components/v6/macro/ui';

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
  if (score >= 40) return { label: 'Structural', cls: 'x-tag x-tag--r' };
  if (score >= 18) return { label: 'Watch', cls: 'x-tag' };
  return { label: 'Noise', cls: 'x-tag mc-imp--low' };
}

/** Lightweight geopolitics board: keyword heuristic over free news (not a paid geo terminal). */
export default function GeoRisk({ headlines }: { headlines: MacroState['headlines'] }) {
  const now = Date.now();
  const scored = headlines
    .map(h => ({ ...h, score: scoreHeadline(h.title) }))
    .filter(h => h.score > 0)
    .sort((a, b) => b.score - a.score);

  const avg = scored.length ? Math.round(scored.reduce((s, h) => s + h.score, 0) / scored.length) : 0;
  const [heat, tag] = avg >= 35 ? ['elevated', 'x-tag x-tag--r'] : avg >= 15 ? ['moderate', 'x-tag'] : ['low', 'x-tag x-tag--g'];

  return (
    <div className="mc-stack" data-testid="macro-geo-risk">
      <PanelHead eyebrow="Geopolitical risk" title="Event heat" right={<span className={tag}>Heat: {heat} <b className="m">{avg}</b></span>}
        lead="Keyword scoring over the free news wire. Educational triage, not a proprietary geopolitics terminal; structural and noise labels are model output only." />

      {!scored.length ? (
        <div className="x-card"><EmptyState icon="shield" ghost="news" title="Nothing flagged">No geopolitical headlines in the current window. Calm is good news.</EmptyState></div>
      ) : (
        <section className="x-card">
          <ul className="mc-hl mc-geo x-list" data-testid="macro-geo-list">
            {scored.slice(0, 12).map((h, i) => {
              const t = tier(h.score);
              return (
                <li key={`${h.url}-${i}`}>
                  <span className={t.cls}>{t.label}</span>
                  <a href={h.url} target="_blank" rel="noreferrer">
                    <b>{h.title}</b>
                    <small>{h.source ?? '—'} · {formatWhen(h.at, now)} · score <span className="m">{h.score}</span></small>
                  </a>
                  <IExt size={13} className="mc-hl-x" />
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
