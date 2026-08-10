'use client';

import { useCountUp } from '@/hooks/use-count-up';
import type { MacroState } from '@/lib/macro-api';
import { deltaPct, formatIndicatorValue, formatSignedPct } from '@/lib/macro-format';
import Sparkline from './sparkline';

function pick(macro: MacroState['macro'], key: string) {
  return macro.find(m => m.key === key) ?? null;
}

function AnimatedValue({ value, unit }: { value: number; unit: string | null | undefined }) {
  const n = useCountUp(value, { duration: 1000, decimals: 2 });
  return <>{formatIndicatorValue(n ?? value, unit)}</>;
}

function Metric({
  label,
  row,
  hint,
  index = 0,
}: {
  label: string;
  row: MacroState['macro'][number] | null;
  hint?: string;
  index?: number;
}) {
  const d = row ? deltaPct(row.value, row.prev) : null;
  return (
    <div className="tcard p-4 flex flex-col h-full min-h-[120px] rise" style={{ ['--i' as string]: index }}>
      <div className="text-[10px] tracking-[0.16em] text-fg-3">{label}</div>
      <div className="mt-2 numeric text-xl font-display font-black text-fg">
        {row ? <AnimatedValue value={row.value} unit={row.unit} /> : '—'}
      </div>
      <div className="text-[11px] text-fg-3 mt-1 flex items-center justify-between gap-2">
        <span>{hint ?? row?.label ?? '—'}</span>
        {d != null && (
          <span className={`numeric ${d > 0 ? 'text-profit' : d < 0 ? 'text-loss' : ''}`}>
            {formatSignedPct(d, 1)}
          </span>
        )}
      </div>
      {row?.history && row.history.length >= 2 && (
        <div className="mt-auto pt-3"><Sparkline values={row.history} /></div>
      )}
    </div>
  );
}

/** Net liquidity + banking stress console. */
export default function LiquidityConsole({ macro }: { macro: MacroState['macro'] }) {
  const net = pick(macro, 'NET_LIQUIDITY');
  const walcl = pick(macro, 'WALCL');
  const rrp = pick(macro, 'RRPONTSYD');
  const tga = pick(macro, 'WTREGEN');
  const nfci = pick(macro, 'NFCI');
  const hy = pick(macro, 'BAMLH0A0HYM2');
  const vix = pick(macro, 'VIXCLS');

  const stress =
    (nfci && nfci.value > 0 ? 1 : 0) +
    (hy && hy.prev != null && hy.value > hy.prev ? 1 : 0) +
    (vix && vix.value >= 20 ? 1 : 0);
  const stressLabel = stress >= 2 ? 'ELEVATED' : stress === 1 ? 'WATCH' : 'CALM';
  const stressTone = stress >= 2 ? 'text-loss border-loss/30 bg-loss/10' : stress === 1 ? 'text-warning border-warning/30 bg-warning/10' : 'text-profit border-profit/30 bg-profit/10';

  return (
    <div className="space-y-3" data-testid="macro-liquidity-console">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] tracking-[0.2em] text-fg-3">// BANKING & LIQUIDITY</div>
          <h2 className="font-display font-black text-xl tracking-tight mt-1">Net Liquidity Console</h2>
        </div>
        <span className={`text-[10px] tracking-[0.14em] px-2 py-1 rounded border ${stressTone}`}>
          STRESS · {stressLabel}
        </span>
      </div>

      <p className="text-[12px] text-fg-3 max-w-2xl leading-relaxed">
        Net liquidity = Fed balance sheet − TGA − reverse repo. Expanding liquidity historically
        supports risk assets; draining it tightens financial conditions.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 items-stretch">
        <Metric label="NET LIQUIDITY" row={net} hint="WALCL − TGA − RRP" index={0} />
        <Metric label="FED BALANCE SHEET" row={walcl} index={1} />
        <Metric label="TGA" row={tga} hint="Treasury General Account" index={2} />
        <Metric label="ON RRP" row={rrp} hint="Reverse repo facility" index={3} />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-stretch">
        <Metric label="NFCI" row={nfci} hint="Chicago Fed conditions (− = loose)" index={0} />
        <Metric label="HY OAS" row={hy} hint="High-yield credit spread" index={1} />
        <Metric label="VIX" row={vix} hint="Equity vol / risk appetite" index={2} />
      </div>
    </div>
  );
}
