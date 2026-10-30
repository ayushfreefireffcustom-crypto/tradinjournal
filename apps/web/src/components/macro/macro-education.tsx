'use client';

import { GROUP_ORDER, GROUP_ICON, INDICATOR_META, type MacroGroup } from '@/lib/macro-meta';
import { GroupIcon, PanelHead, groupTitle } from '@/components/v6/macro/ui';

const CONCEPTS: { title: string; body: string }[] = [
  {
    title: 'Net liquidity',
    body: 'Fed balance sheet minus TGA minus reverse repo. Rising net liquidity adds fuel for risk assets; draining it tightens conditions.',
  },
  {
    title: 'Confluence score',
    body: 'A 0–100 bias built from weighted macro factors (inflation, policy, growth, rates, liquidity, credit, risk, dollar) and each asset’s sensitivities.',
  },
  {
    title: 'Regime quadrant',
    body: 'Growth × inflation map: Goldilocks, Reflation, Stagflation, Deflation. Guides which asset classes historically lead.',
  },
  {
    title: 'Yield curve inversion',
    body: 'When short rates exceed long rates (e.g. 2s10s < 0), markets often price tighter policy and higher recession odds.',
  },
  {
    title: 'Ref quotes',
    body: 'Reference or delayed prints (official FX, ETF proxies). Not a tick-by-tick feed — use TradingView for live charts.',
  },
];

/** Education glossary from macro-meta plus desk concepts. */
export default function MacroEducation() {
  const byGroup = GROUP_ORDER.map(g => ({
    group: g as MacroGroup,
    items: Object.entries(INDICATOR_META).filter(([, m]) => m.group === g),
  })).filter(g => g.items.length > 0);

  return (
    <div className="mc-stack" data-testid="macro-education">
      <PanelHead eyebrow="Education" title="Macro glossary" lead="Plain-English primers for every concept on the dashboard, from beginner to desk-ready." />

      <div className="mc-2 mc-2--even">
        {CONCEPTS.map(c => (
          <article key={c.title} className="x-card mc-ed-c">
            <h3>{c.title}</h3>
            <p>{c.body}</p>
          </article>
        ))}
      </div>

      <div className="mc-igs">
        {byGroup.map(({ group, items }) => (
          <div key={group} className="mc-igs-i">
            <section className="x-card">
              <div className="x-ch"><GroupIcon name={GROUP_ICON[group]} /><h3>{groupTitle(group)}</h3><span className="x-r m">{items.length}</span></div>
              <ul className="mc-ed-l x-list">
                {items.map(([key, meta]) => (
                  <li key={key}><b className="m">{key}</b><p>{meta.blurb}</p></li>
                ))}
              </ul>
            </section>
          </div>
        ))}
      </div>
    </div>
  );
}
