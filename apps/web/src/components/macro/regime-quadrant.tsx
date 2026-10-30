'use client';

import type { MacroState } from '@/lib/macro-api';
import CountUp from './count-up';

type Regime = NonNullable<MacroState['regime']>;

interface Quad {
  key: string;
  name: string;
  g: 'up' | 'down';
  i: 'up' | 'down';
  read: string;
}

const QUADS: Quad[] = [
  { key: 'goldilocks', name: 'Goldilocks', g: 'up', i: 'down', read: 'Growth firms while inflation cools — the friendliest tape for risk.' },
  { key: 'reflation', name: 'Reflation', g: 'up', i: 'up', read: 'Growth and inflation both rising — commodities and cyclicals lead.' },
  { key: 'deflation', name: 'Deflation', g: 'down', i: 'down', read: 'Growth and inflation both falling — duration and quality outperform.' },
  { key: 'stagflation', name: 'Stagflation', g: 'down', i: 'up', read: 'Weak growth with sticky inflation — the hardest regime for the Fed.' },
];

const DEFLATION: Quad = QUADS[2]!;

function activeQuad(regime: Regime): Quad {
  return QUADS.find(q => q.g === regime.growth && q.i === regime.inflation) ?? DEFLATION;
}

export default function RegimeQuadrant({ regime }: { regime: MacroState['regime'] }) {
  if (!regime) {
    return (
      <section className="x-card" data-testid="macro-regime-quadrant-empty">
        <div className="x-ch"><h2>Regime</h2><span className="x-sub">growth × inflation</span></div>
        <p className="x-muted mc-p">No regime classified yet.</p>
      </section>
    );
  }

  const active = activeQuad(regime);
  const odds = regime.recessionOdds;

  return (
    <section className="x-card mc-rq" data-testid="macro-regime-quadrant">
      <div className="x-ch"><h2>Regime</h2><span className="x-sub">growth × inflation</span></div>
      <div className="mc-rq-in">
        <div className="mc-rq-map">
          <span className="mc-rq-y"><span>Growth falling</span><span>Growth rising</span></span>
          <div className="mc-rq-grid">
            {QUADS.map(q => {
              const on = q.key === active.key;
              return (
                <div key={q.key} style={{ gridArea: `${q.g === 'up' ? 1 : 2}/${q.i === 'down' ? 1 : 2}` }}
                  data-testid={`regime-quad-${q.key}`} data-active={on} className={on ? 'on' : ''}>
                  {on && <i className="x-dot" aria-hidden />}{q.name}
                </div>
              );
            })}
          </div>
          <span className="mc-rq-x"><span>Inflation falling</span><span>Inflation rising</span></span>
        </div>
        <div className="mc-rq-read">
          <b data-testid="regime-active-label">{active.name}</b>
          <p>{active.read}</p>
          {odds != null && (
            <div className="mc-rq-odds">
              <span>Recession odds <CountUp value={odds} suffix="%" className="m" duration={1000} /></span>
              <div className="x-bar"><i style={{ width: `${Math.max(0, Math.min(100, odds))}%`, background: odds >= 30 ? 'var(--r)' : 'var(--g)' }} /></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
