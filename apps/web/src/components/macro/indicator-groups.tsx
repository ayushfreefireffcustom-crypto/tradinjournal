'use client';

import type { MacroState } from '@/lib/macro-api';
import { formatIndicatorValue, indicatorDelta } from '@/lib/macro-format';
import { groupIndicators, blurbFor, formatObsDate, sourceLabel, type IndicatorGroup } from '@/lib/macro-meta';
import { GroupIcon, groupTitle } from '@/components/v6/macro/ui';
import Sparkline from '@/components/v6/ui/sparkline';
import InfoTip from './info-tip';

function Panel({ g }: { g: IndicatorGroup }) {
  return (
    <section className="x-card mc-ig" data-testid={`macro-group-${g.group}`}>
      <div className="x-ch"><GroupIcon name={g.icon} /><h3>{groupTitle(g.group)}</h3><span className="x-r m">{g.items.length}</span></div>
      <ul className="mc-ig-l">
        {g.items.map(m => {
          const d = indicatorDelta(m.value, m.prev, m.unit);
          const blurb = blurbFor(m.key);
          return (
            <li key={m.key} data-testid={`macro-ind-${m.key}`}>
              <div className="mc-ig-n">
                <span className="mc-ig-t"><span>{m.label}</span>{blurb && <InfoTip text={blurb} label={m.label} />}</span>
                <small>{sourceLabel(m.source)} · {formatObsDate(m.asOf)}</small>
              </div>
              {m.history && m.history.length >= 2 && <span className="mc-ig-s"><Sparkline values={m.history} width={56} height={20} /></span>}
              <div className="mc-ig-v">
                <b className="m">{formatIndicatorValue(m.value, m.unit)}</b>
                <small className={`m ${d ? (d.dir > 0 ? 'pos' : d.dir < 0 ? 'neg' : 'x-dim') : 'x-dim'}`}>{d ? d.text : '—'}</small>
              </div>
            </li>
          );
        })}
      </ul>
      {g.group === 'Liquidity Plumbing' && <p className="mc-ig-f">Net liquidity = balance sheet − reverse repo − TGA</p>}
    </section>
  );
}

export default function IndicatorGroups({ macro }: { macro: MacroState['macro'] }) {
  if (!macro.length) {
    return <div className="x-card x-empty" data-testid="macro-groups-empty"><b>No indicators yet</b><p>FRED indicators appear after the first data ingest.</p></div>;
  }
  return (
    <div className="mc-igs" data-testid="macro-indicator-groups">
      {groupIndicators(macro).map(g => <div key={g.group} className="mc-igs-i"><Panel g={g} /></div>)}
    </div>
  );
}
