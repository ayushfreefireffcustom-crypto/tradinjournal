'use client';

// Assets × drivers heat grid. Each cell is the engine's own contribution term
// (weight × direction × sensitivity) bucketed to −2..+2; net bias is the
// asset's 0–100 confluence score mapped to −100..+100, with yesterday's value
// as a tick. Three layouts by width: full, medium (no 30-day column), phone
// (abbreviated columns + a "flips if" list under the table).
import type { MacroDriver, MacroGridRow, MacroOverviewInput } from '@/lib/macro-api';
import { AiLabel, SecHead, Spark, lin, useWidth } from './parts';
import { ASSET_NAME, ASSET_SHORT, DRIVER_LABEL, cellText, driverReading, heat, signed, tradedLabel } from './format';

function NetBar({ v, was, w = 110 }: { v: number; was: number | null; w?: number }) {
  const x = lin(-100, 100, 2, w - 2);
  return (
    <svg width={w} height={16} viewBox={`0 0 ${w} 16`} aria-hidden className="mo-nb-bar">
      <line x1={2} x2={w - 2} y1={8} y2={8} className="mo-ax" />
      <line x1={x(0)} x2={x(0)} y1={2} y2={14} className="mo-ax" />
      <rect x={Math.min(x(0), x(v))} y={4} width={Math.max(1, Math.abs(x(v) - x(0)))} height={8} className={v >= 0 ? 'mo-fu' : 'mo-fd'} />
      {was != null && <line x1={x(was)} x2={x(was)} y1={0} y2={16} className="mo-tick" />}
    </svg>
  );
}

function Legend() {
  return (
    <span className="mo-legend">
      <i style={{ background: heat(-2) }} /><i style={{ background: heat(-1) }} />pushes down
      <span className="mo-legend-gap" />pushes up<i style={{ background: heat(1) }} /><i style={{ background: heat(2) }} />
    </span>
  );
}

const netWord = (v: number) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v)}`;

export default function DriversGrid({ grid, drivers, inputs, traded }: {
  grid: MacroGridRow[];
  drivers: MacroDriver[];
  inputs: MacroOverviewInput[];
  /** Canonical symbols in the user's journal; null while unknown / no account. */
  traded: ReadonlySet<string> | null;
}) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const mode: 'full' | 'mid' | 'phone' = w === 0 || w >= 1000 ? 'full' : w >= 660 ? 'mid' : 'phone';
  // Header density from the real cell width: full labels at 13px, then 11px, then abbreviations.
  const fixed = mode === 'full' ? 168 + 206 + 150 + 96 : 132 + 168 + 118;
  const cellW = w > 0 ? (w - fixed) / Math.max(1, drivers.length) : 80;
  const head: 'l13' | 'l11' | 'short' = cellW >= 66 ? 'l13' : cellW >= 54 ? 'l11' : 'short';
  // Very narrow phones: ticker names and slimmer side columns so the 8 drivers fit without scrolling.
  const tiny = mode === 'phone' && w > 0 && w < 340;
  const core = inputs.find(i => i.key === 'core_cpi')?.value ?? null;
  const cols = drivers.map(d => d.key);
  // Drivers that push no asset today (flat reading): the column stays, its header
  // says so and its cells get a quiet neutral fill instead of a row of dots.
  const quiet = new Set(cols.filter(c => grid.length > 0 && grid.every(row => (row.cells.find(x => x.factor === c)?.cell ?? 0) === 0)));
  const quietWord = (d: MacroDriver) => (d.direction === 0 ? 'flat today' : 'no push');
  const reading = (d: MacroDriver) => {
    const t = driverReading(d, core);
    return quiet.has(d.key) ? t.replace(/ flat$/, '') : t;
  };
  const yesterdayNote = grid.some(g => g.netYesterday != null) ? 'tick = yesterday' : 'no snapshot yesterday';

  return (
    <section className="mo-sec" aria-labelledby="mo-h-drivers">
      <SecHead id="mo-h-drivers" title="Assets × drivers" sub="effect of each driver on price today"
        right={<><Legend /><AiLabel detail={`${cols.length} rules per asset`} /></>} />
      <div ref={ref} className="mo-hg-wrap">
        {mode !== 'phone' ? (
          <>
          <table className={`mo-hg${head !== 'l13' ? ' mo-hg--mid' : ''}`} data-testid="macro-drivers-grid">
            <colgroup>
              <col style={{ width: mode === 'full' ? 168 : 132 }} />
              {cols.map(c => <col key={c} />)}
              <col style={{ width: mode === 'full' ? 206 : 168 }} />
              <col style={{ width: mode === 'full' ? 150 : 118 }} />
              {mode === 'full' && <col style={{ width: 96 }} />}
            </colgroup>
            <thead>
              <tr>
                <th scope="col">Asset</th>
                {drivers.map(d => (
                  <th key={d.key} scope="col" className={quiet.has(d.key) ? 'mo-hg-qh' : undefined}
                    title={`${DRIVER_LABEL[d.key].long}: ${driverReading(d, core)}${quiet.has(d.key) ? ` · ${quietWord(d)}, no asset pushed` : ''}`}>
                    <b>{head === 'short' ? DRIVER_LABEL[d.key].short : DRIVER_LABEL[d.key].long}</b>
                    {head !== 'short' && <span className="m">{reading(d)}</span>}
                    {quiet.has(d.key) && <em>{head === 'short' ? 'flat' : quietWord(d)}</em>}
                  </th>
                ))}
                <th scope="col" className="mo-hg-net"><b>Net bias</b>{mode === 'full' ? `−100..+100 · ${yesterdayNote}` : yesterdayNote}</th>
                <th scope="col" className="mo-hg-fl"><b>Flips if</b></th>
                {mode === 'full' && <th scope="col" className="mo-hg-tr"><b>30 days</b></th>}
              </tr>
            </thead>
            <tbody>
              {grid.map(r => (
                <tr key={r.asset} data-testid={`macro-grid-${r.asset}`}>
                  <th scope="row" className="mo-hg-an">
                    <b>{ASSET_NAME[r.asset] ?? r.asset}</b>
                    {traded && <span>{tradedLabel(r.asset, traded)}</span>}
                  </th>
                  {r.cells.map(c => quiet.has(c.factor) ? (
                    <td key={c.factor} className="mo-hg-c mo-hg-q" title={`${DRIVER_LABEL[c.factor].long}: no push today`}><span className="mo-sr">no push</span></td>
                  ) : (
                    <td key={c.factor} className={`mo-hg-c m${c.cell ? '' : ' mo-hg-z'}`} style={{ background: heat(c.cell) }}
                      title={`${DRIVER_LABEL[c.factor].long}: ${signed(c.raw, 2)}`}>
                      {cellText(c.cell)}
                    </td>
                  ))}
                  <td className="mo-hg-net">
                    <div className="mo-nb">
                      <b className={`m ${r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : ''}`}>{netWord(r.net)}</b>
                      <NetBar v={r.net} was={r.netYesterday} w={mode === 'full' ? 110 : 84} />
                    </div>
                  </td>
                  <td className="mo-hg-fl">{r.flipsIf?.text ?? 'No single driver'}</td>
                  {mode === 'full' && (
                    <td className="mo-hg-tr">
                      <Spark values={r.trend} w={88} h={24} dot={false} tone={r.net >= 0 ? 'pos' : 'neg'} label={`${ASSET_NAME[r.asset] ?? r.asset} net bias, ${r.trend.length} days`} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {head === 'short' && <p className="mo-hg-key">{drivers.map(d => `${DRIVER_LABEL[d.key].short} ${DRIVER_LABEL[d.key].long.toLowerCase()} ${reading(d)}${quiet.has(d.key) ? ` (${quietWord(d)})` : ''}`).join(' · ')}</p>}
          </>
        ) : (
          <>
            <div className="mo-hg-scroll">
              <table className="mo-hg mo-hg--m" data-testid="macro-drivers-grid">
                <colgroup>
                  <col style={{ width: tiny ? 52 : 76 }} />
                  {cols.map(c => <col key={c} />)}
                  <col style={{ width: tiny ? 34 : 40 }} />
                </colgroup>
                <thead>
                  <tr>
                    <th scope="col">Asset</th>
                    {cols.map(c => (
                      <th key={c} scope="col" title={`${DRIVER_LABEL[c].long}${quiet.has(c) ? ': flat today, no asset pushed' : ''}`} className={quiet.has(c) ? 'mo-hg-qh' : undefined}>
                        <b>{DRIVER_LABEL[c].short}</b>{quiet.has(c) && <em>flat</em>}
                      </th>
                    ))}
                    <th scope="col" className="mo-hg-netm"><b>Net</b></th>
                  </tr>
                </thead>
                <tbody>
                  {grid.map(r => (
                    <tr key={r.asset} data-testid={`macro-grid-${r.asset}`}>
                      <th scope="row" className="mo-hg-an"><b>{tiny ? r.asset === 'XAU' ? 'Gold' : r.asset === 'OIL' ? 'WTI' : r.asset : ASSET_SHORT[r.asset] ?? r.asset}</b></th>
                      {r.cells.map(c => quiet.has(c.factor) ? (
                        <td key={c.factor} className="mo-hg-c mo-hg-q"><span className="mo-sr">no push</span></td>
                      ) : (
                        <td key={c.factor} className={`mo-hg-c m${c.cell ? '' : ' mo-hg-z'}`} style={{ background: heat(c.cell) }}>{cellText(c.cell)}</td>
                      ))}
                      <td className="mo-hg-netm"><b className={`m ${r.net > 0 ? 'pos' : r.net < 0 ? 'neg' : ''}`}>{netWord(r.net)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mo-hg-key">{cols.map(c => `${DRIVER_LABEL[c].short} ${c === 'policy' ? 'Fed policy' : c === 'risk' ? 'risk (VIX)' : DRIVER_LABEL[c].long.toLowerCase()}${quiet.has(c) ? ' (flat today)' : ''}`).join(' · ')}</p>
            <div className="mo-flips">
              <h3 className="mo-flips-h">Flips if</h3>
              <ul>
                {grid.map(r => (
                  <li key={r.asset}>
                    <b>{ASSET_NAME[r.asset] ?? r.asset}</b>
                    <span>{r.flipsIf?.text ?? 'No single driver'}</span>
                    {traded && <em>{tradedLabel(r.asset, traded)}</em>}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </section>
  );
}
