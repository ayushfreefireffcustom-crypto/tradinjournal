'use client';

import { GROUP_ORDER, GROUP_GLYPH, INDICATOR_META, type MacroGroup } from '@/lib/macro-meta';

const CONCEPTS: { title: string; body: string }[] = [
  {
    title: 'Net Liquidity',
    body: 'Fed balance sheet minus TGA minus reverse repo. Rising net liquidity adds fuel for risk assets; draining it tightens conditions.',
  },
  {
    title: 'Confluence Score',
    body: 'A 0–100 bias built from weighted macro factors (inflation, policy, growth, rates, liquidity, credit, risk, dollar) and each asset’s sensitivities.',
  },
  {
    title: 'Regime Quadrant',
    body: 'Growth × inflation map: Goldilocks, Reflation, Stagflation, Deflation. Guides which asset classes historically lead.',
  },
  {
    title: 'Yield Curve Inversion',
    body: 'When short rates exceed long rates (e.g. 2s10s < 0), markets often price tighter policy and higher recession odds.',
  },
  {
    title: 'REF Quotes',
    body: 'Reference or delayed prints (official FX, ETF proxies). Not a tick-by-tick feed — use TradingView for live charts.',
  },
];

/** Education glossary from macro-meta + desk concepts. */
export default function MacroEducation() {
  const byGroup = GROUP_ORDER.map(g => ({
    group: g as MacroGroup,
    items: Object.entries(INDICATOR_META).filter(([, m]) => m.group === g),
  })).filter(g => g.items.length > 0);

  return (
    <div className="space-y-4" data-testid="macro-education">
      <div>
        <div className="text-[10px] tracking-[0.2em] text-fg-3">Education</div>
        <h2 className="font-display font-black text-xl tracking-tight mt-1">Macro Glossary</h2>
        <p className="text-[12px] text-fg-3 mt-1 max-w-2xl leading-relaxed">
          Plain-English primers for every dashboard concept — beginner to desk-ready.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 items-stretch">
        {CONCEPTS.map(c => (
          <article key={c.title} className="tcard p-4 h-full">
            <h3 className="font-display font-bold text-[15px] tracking-tight">{c.title}</h3>
            <p className="text-[12px] text-fg-3 mt-2 leading-relaxed">{c.body}</p>
          </article>
        ))}
      </div>

      <div className="space-y-3">
        {byGroup.map(({ group, items }) => (
          <section key={group} className="tcard p-4">
            <div className="flex items-center gap-2 border-b border-border-soft pb-2">
              <span className="text-fg-3 w-4 text-center">{GROUP_GLYPH[group]}</span>
              <h3 className="text-[11px] tracking-[0.16em] uppercase text-fg">{group}</h3>
              <span className="ml-auto text-[10px] text-fg-3 numeric">{items.length}</span>
            </div>
            <ul className="mt-2 divide-y divide-border-soft">
              {items.map(([key, meta]) => (
                <li key={key} className="py-2">
                  <div className="text-[12px] text-fg font-medium">{key}</div>
                  <p className="text-[11px] text-fg-3 mt-0.5 leading-relaxed">{meta.blurb}</p>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
