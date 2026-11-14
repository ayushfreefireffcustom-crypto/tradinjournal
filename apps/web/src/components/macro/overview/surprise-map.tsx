'use client';

// US releases × 12 months, coloured by actual vs forecast: red = hotter than
// forecast (hurts risk via the Fed), green = cooler. Grey dash = no release with
// a forecast that month (history is only as deep as the calendar store).
import type { MacroSurprise } from '@/lib/macro-api';
import { AiLine, SecHead, useWidth } from './parts';
import { monthShort, surpriseFill } from './format';

const SERIES = ['CPI m/m', 'Core CPI m/m', 'Payrolls', 'Unemployment', 'Retail sales', 'ISM manufacturing', 'Jobless claims'];

/** Last 12 months ending this month, for the empty state. */
function lastMonths(): string[] {
  const d = new Date();
  const out: string[] = [];
  for (let k = 11; k >= 0; k--) {
    const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - k, 1));
    out.push(t.toISOString().slice(0, 7));
  }
  return out;
}

export default function SurpriseMap({ surprise }: { surprise: MacroSurprise | null }) {
  const [ref, w] = useWidth<HTMLDivElement>();
  const compact = w > 0 && w < 560;
  const months = surprise?.months ?? lastMonths();
  const rows = surprise?.series ?? SERIES.map((label, i) => ({ key: String(i), label, cells: months.map(m => ({ month: m, level: null, actual: null, forecast: null })) }));
  const lw = compact ? 106 : 132; // fits "ISM manufacturing" at 11px
  const cw = Math.max(10, (w - lw) / months.length);
  const ch = compact ? 24 : 30;
  const h = rows.length * ch + 24;

  return (
    <div>
      <SecHead title="Surprise map" sub="US data vs forecast, 12 months"
        right={<span className="mo-legend"><i style={{ background: 'rgba(254,58,49,.8)' }} />hotter, hurts risk<span className="mo-legend-gap" /><i style={{ background: 'rgba(8,196,101,.7)' }} />cooler, helps risk</span>} />
      <div ref={ref} className="mo-sur">
        {w > 0 && (
          <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label="Surprise map: US releases versus forecast over 12 months">
            {months.map((m, i) => {
              const last = i === months.length - 1;
              if (compact && i % 2 === 0 && !last) return null;
              // A month name is wider than a narrow column: the last one ends flush with the edge instead of being cut off.
              const flush = last && cw < 28;
              return (
                <text key={m} x={flush ? lw + months.length * cw : lw + i * cw + cw / 2} y={12} textAnchor={flush ? 'end' : 'middle'} className={`mo-t11 ${last ? 'mo-tx1' : 'mo-tx3'}`} fontWeight={last ? 700 : 400}>{monthShort(m)}</text>
              );
            })}
            {rows.map((r, ri) => {
              const y = 20 + ri * ch;
              return (
                <g key={r.key}>
                  <text x={0} y={y + ch / 2 + 4} className="mo-t11 mo-tx2">{r.label}</text>
                  {r.cells.map((c, i) => {
                    const fill = surpriseFill(c.level);
                    const cx = lw + i * cw;
                    if (!fill) {
                      return <text key={c.month} x={cx + cw / 2} y={y + ch / 2 + 4} textAnchor="middle" className="mo-t11 mo-tx3">–</text>;
                    }
                    return (
                      <rect key={c.month} x={cx + 1.5} y={y + 1.5} width={Math.max(1, cw - 3)} height={ch - 3} fill={fill}>
                        <title>{`${r.label} ${monthShort(c.month, true)}: actual ${c.actual ?? '–'} vs forecast ${c.forecast ?? '–'}`}</title>
                      </rect>
                    );
                  })}
                </g>
              );
            })}
            <rect x={lw + (months.length - 1) * cw} y={19} width={cw} height={rows.length * ch + 2} fill="none" className="mo-cur" />
          </svg>
        )}
      </div>
      {surprise?.line ? (
        <div className="mo-mt12"><AiLine text={surprise.line} detail={`${surprise.releases} ${surprise.releases === 1 ? 'release' : 'releases'}`} /></div>
      ) : (
        <p className="mo-note">{surprise ? 'Too few releases with forecasts to read a trend yet.' : 'No US releases with forecasts stored yet. Cells fill as the calendar records them.'}</p>
      )}
    </div>
  );
}
