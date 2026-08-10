'use client';

import type { MacroState } from '@/lib/macro-api';
import { formatIndicatorValue, indicatorDelta } from '@/lib/macro-format';
import { groupIndicators, blurbFor, formatObsDate, sourceLabel, type IndicatorGroup } from '@/lib/macro-meta';
import InfoTip from './info-tip';
import Sparkline from './sparkline';

function deltaTone(dir: -1 | 0 | 1): string {
  if (dir > 0) return 'text-profit';
  if (dir < 0) return 'text-loss';
  return 'text-fg-3';
}
function arrow(dir: -1 | 0 | 1): string {
  if (dir > 0) return '▲';
  if (dir < 0) return '▼';
  return '·';
}

function Panel({ g }: { g: IndicatorGroup }) {
  return (
    <section className="tcard p-3 sm:p-4 h-full flex flex-col" data-testid={`macro-group-${g.group}`}>
      <div className="flex items-center justify-between border-b border-border-soft pb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-fg-3 text-sm w-4 text-center">{g.glyph}</span>
          <h3 className="text-[11px] tracking-[0.16em] text-fg font-medium uppercase">{g.group}</h3>
        </div>
        <span className="text-[10px] text-fg-3 numeric">{g.items.length}</span>
      </div>

      <ul className="mt-1 divide-y divide-border-soft flex-1">
        {g.items.map(m => {
          const d = indicatorDelta(m.value, m.prev, m.unit);
          const blurb = blurbFor(m.key);
          return (
            <li key={m.key} className="flex items-center gap-3 py-2" data-testid={`macro-ind-${m.key}`}>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-[12px] text-fg-2 truncate">{m.label}</span>
                  {blurb && <InfoTip text={blurb} label={m.label} />}
                </div>
                <div className="text-[9px] text-fg-3 tracking-wide mt-0.5">
                  {sourceLabel(m.source)} · {formatObsDate(m.asOf)}
                </div>
              </div>
              {m.history && m.history.length >= 2 && (
                <div className="shrink-0 hidden sm:block"><Sparkline values={m.history} /></div>
              )}
              <div className="text-right shrink-0">
                <div className="numeric text-[15px] text-fg leading-none">
                  {formatIndicatorValue(m.value, m.unit)}
                </div>
                <div className={`numeric text-[11px] mt-1 ${d ? deltaTone(d.dir) : 'text-fg-3'}`}>
                  {d ? `${arrow(d.dir)} ${d.text}` : '—'}
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {g.group === 'Liquidity Plumbing' && (
        <div className="mt-auto pt-2 border-t border-border-soft text-[9px] text-fg-3 tracking-wide shrink-0">
          NET LIQUIDITY = BALANCE SHEET − REVERSE REPO − TGA
        </div>
      )}
    </section>
  );
}

export default function IndicatorGroups({ macro }: { macro: MacroState['macro'] }) {
  if (!macro.length) {
    return (
      <div className="tcard p-4 text-sm text-fg-3" data-testid="macro-groups-empty">
        No FRED indicators ingested yet.
      </div>
    );
  }
  const groups = groupIndicators(macro);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-stretch" data-testid="macro-indicator-groups">
      {groups.map(g => (
        <Panel key={g.group} g={g} />
      ))}
    </div>
  );
}
