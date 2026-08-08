'use client';

import type { MacroState } from '@/lib/macro-api';

type Regime = NonNullable<MacroState['regime']>;

interface Quad {
  key: string;
  name: string;
  /** growth direction, inflation direction */
  g: 'up' | 'down';
  i: 'up' | 'down';
  read: string;
}

// Classic macro four-quadrant map (growth × inflation).
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

/** Grid position: columns = inflation (left down / right up), rows = growth (top up / bottom down). */
function cellFor(g: 'up' | 'down', i: 'up' | 'down'): string {
  const col = i === 'down' ? 1 : 2;
  const row = g === 'up' ? 1 : 2;
  return `${row}/${col}`;
}

export default function RegimeQuadrant({ regime }: { regime: MacroState['regime'] }) {
  if (!regime) {
    return (
      <div className="tcard p-4 flex flex-col" data-testid="macro-regime-quadrant-empty">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// REGIME</div>
        <p className="text-sm text-fg-3 mt-3">No regime classified yet.</p>
      </div>
    );
  }

  const active = activeQuad(regime);
  const odds = regime.recessionOdds;

  return (
    <div className="tcard p-4 flex flex-col" data-testid="macro-regime-quadrant">
      <div className="flex items-center justify-between">
        <div className="text-[10px] tracking-[0.2em] text-fg-3">// REGIME</div>
        <div className="text-[10px] tracking-[0.14em] text-fg-3">GROWTH × INFLATION</div>
      </div>

      <div className="mt-3 flex flex-col sm:flex-row gap-4 items-start">
        {/* Quadrant grid — capped so the card stays a sensible height */}
        <div className="w-full sm:w-[220px] shrink-0">
          <div className="flex gap-2">
            {/* Y axis (growth) */}
            <div className="flex flex-col items-center justify-between py-1 text-[9px] tracking-[0.14em] text-fg-3">
              <span>G+</span>
              <span className="[writing-mode:vertical-rl] rotate-180 tracking-[0.3em]">GROWTH</span>
              <span>G−</span>
            </div>
            <div className="flex-1">
              <div className="grid grid-cols-2 grid-rows-2 gap-1.5 aspect-square">
                {QUADS.map(q => {
                  const isActive = q.key === active.key;
                  return (
                    <div
                      key={q.key}
                      style={{ gridArea: cellFor(q.g, q.i) }}
                      data-testid={`regime-quad-${q.key}`}
                      data-active={isActive}
                      className={`relative rounded-[var(--radius-btn)] border flex items-center justify-center p-1 text-center transition-colors ${
                        isActive
                          ? 'border-profit/50 bg-profit/10 text-fg shadow-[var(--shadow-glow-green)]'
                          : 'border-border-soft bg-surface/40 text-fg-3'
                      }`}
                    >
                      <span className={`text-[10px] font-display tracking-tight ${isActive ? 'font-black' : 'font-medium'}`}>
                        {q.name}
                      </span>
                      {isActive && (
                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-profit pulse-dot" />
                      )}
                    </div>
                  );
                })}
              </div>
              {/* X axis (inflation) */}
              <div className="flex items-center justify-between mt-1 text-[9px] tracking-[0.14em] text-fg-3">
                <span>INFL−</span>
                <span className="tracking-[0.24em]">INFL</span>
                <span>INFL+</span>
              </div>
            </div>
          </div>
        </div>

        {/* Read + recession odds */}
        <div className="flex-1 min-w-0 flex flex-col self-stretch">
          <div className="font-display font-black text-xl tracking-tight text-fg" data-testid="regime-active-label">
            {active.name}
          </div>
          <p className="text-[12px] text-fg-3 leading-snug mt-1">{active.read}</p>

          {odds != null && (
            <div className="mt-auto pt-4">
              <div className="flex items-center justify-between text-[10px] tracking-[0.14em] text-fg-3">
                <span>RECESSION ODDS</span>
                <span className="numeric text-fg">{Math.round(odds)}%</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-border-soft overflow-hidden">
                <div
                  className={`h-full ${odds >= 50 ? 'bg-loss' : odds >= 30 ? 'bg-warning' : 'bg-profit'}`}
                  style={{ width: `${Math.max(0, Math.min(100, odds))}%` }}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
